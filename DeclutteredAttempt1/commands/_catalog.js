/**
 * Turns a commandCatalog.js entry into the two things an adapter needs: the
 * SlashCommandBuilder it exports as `data`, and the spec its readOptions call
 * passes.
 *
 * Both come from the same entry, so an option's name and kind are written once
 * in the catalogue and cannot drift between what Discord is told and what the
 * adapter reads back. Before this, every option was spelled out twice - once
 * in a builder chain, once in a readOptions spec - and nothing checked them
 * against each other.
 *
 * This file must never import anything below the adapter layer; it is part of
 * the Discord boundary, like _adapter.js.
 */
const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType } = require('discord.js');
const { COMMANDS } = require('../commandCatalog.js');

// catalogue kind -> the SlashCommandBuilder method that declares it
const ADDERS = {
  string: 'addStringOption',
  integer: 'addIntegerOption',
  number: 'addNumberOption',
  boolean: 'addBooleanOption',
  user: 'addUserOption',
  channel: 'addChannelOption',
  attachment: 'addAttachmentOption',
};

// an attachment arrives as a discord.js Attachment, which readOptions has no
// kind for: the adapter that wants one flattens it itself (see register.js)
const READABLE_KINDS = new Set(['string', 'integer', 'number', 'boolean', 'user', 'channel']);

function entryFor(name) {
  const entry = COMMANDS[name];
  if (!entry) {
    throw new Error(`commandCatalog has no entry for "${name}" - add one, or fix the name the adapter asks for`);
  }
  return entry;
}

/** Declares one option on a builder or subcommand builder. */
function applyOption(target, name, spec) {
  const adder = ADDERS[spec.kind];
  if (!adder) {
    throw new Error(`commandCatalog: option "${name}" has unknown kind "${spec.kind}"`);
  }
  return target[adder]((option) => {
    option.setName(name).setDescription(spec.description);
    // only set what the entry actually declares: setRequired(false) and
    // setRequired(undefined) are not the same call to the builder
    if (spec.required) option.setRequired(true);
    if (spec.min !== undefined) option.setMinValue(spec.min);
    if (spec.max !== undefined) option.setMaxValue(spec.max);
    if (spec.channelTypes) option.addChannelTypes(...spec.channelTypes);
    if (spec.choices) option.addChoices(...spec.choices);
    return option;
  });
}

/**
 * The SlashCommandBuilder for a catalogued command, ready to export as `data`.
 */
function buildData(name) {
  const entry = entryFor(name);
  const builder = new SlashCommandBuilder().setName(name).setDescription(entry.description);

  if (entry.defaultMemberPermissions) {
    const bit = PermissionFlagsBits[entry.defaultMemberPermissions];
    if (bit === undefined) {
      throw new Error(`commandCatalog: "${name}" wants permission "${entry.defaultMemberPermissions}", which discord.js does not define`);
    }
    builder.setDefaultMemberPermissions(bit);
  }
  if (entry.contexts) {
    builder.setContexts(...entry.contexts.map((context) => {
      const value = InteractionContextType[context];
      if (value === undefined) {
        throw new Error(`commandCatalog: "${name}" wants context "${context}", which discord.js does not define`);
      }
      return value;
    }));
  }

  for (const [optionName, spec] of Object.entries(entry.options || {})) {
    applyOption(builder, optionName, spec);
  }

  // Discord rejects a command that mixes subcommands with top-level options,
  // and one rejected command fails the whole deploy, so the catalogue keeps
  // them in separate keys and a command uses one or the other
  for (const [subName, sub] of Object.entries(entry.subcommands || {})) {
    builder.addSubcommand((subcommand) => {
      subcommand.setName(subName).setDescription(sub.description);
      for (const [optionName, spec] of Object.entries(sub.options || {})) {
        applyOption(subcommand, optionName, spec);
      }
      return subcommand;
    });
  }

  return builder;
}

/**
 * The readOptions spec for a catalogued command: option name -> kind.
 *
 * Subcommand options are flattened in, because readOptions asks the
 * interaction for an option by name and does not care which subcommand
 * declared it. Attachments are left out, as above.
 */
function optionSpec(name) {
  const entry = entryFor(name);
  const spec = {};
  const collect = (options) => {
    for (const [optionName, option] of Object.entries(options || {})) {
      if (READABLE_KINDS.has(option.kind)) spec[optionName] = option.kind;
    }
  };
  collect(entry.options);
  for (const sub of Object.values(entry.subcommands || {})) collect(sub.options);
  return spec;
}

module.exports = { buildData, optionSpec, COMMANDS };

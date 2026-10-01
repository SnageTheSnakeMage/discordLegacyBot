/**
 * The gate every command's `amount` option passes before anything else.
 *
 * An amount counts something the player does or hands over - stabs, shots, AP,
 * upgrades - so it is a whole number of at least 1. Zero would do nothing for
 * nothing, and a negative one runs the command backwards: it heals instead of
 * hurting and pays AP back instead of charging it.
 *
 * The catalogue declares `min: 1` on each of these options, so Discord refuses
 * a bad amount before it is sent. This is the same rule on the logic side, so it
 * holds for commands registered before the minimum was set, and for anything
 * that calls run() without going through Discord.
 */
const { REJECTIONS } = require('../enums.js');

function amountRejection(amount) {
  if (Number.isInteger(amount) && amount >= 1) return null;
  return {
    ok: false,
    reason: REJECTIONS.INVALID_AMOUNT,
    data: { message: 'The amount has to be a whole number of at least 1!' },
  };
}

module.exports = { amountRejection };

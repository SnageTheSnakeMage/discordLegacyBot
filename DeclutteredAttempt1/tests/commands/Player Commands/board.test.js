/**
 * Unit tests for the board command.
 */
jest.mock('../../../utils')
const { createFakeGame, createFakePlayer, createFakeClass, createFakeTile, createFakePopulatedPlaystate, createFakeLayer, createMockModels, createFakeEmptyPlaystate } = require('../../helpers/mockModels');
const utils = require('../../../utils');
const board = require('../../../commands/Player Commands/board');
const blankBoard10 = require('../../testFiles/10x10Blank1Board.json')

describe('[board 1]: use cases', () => {
  const verifiedInputs = 
  
  beforeEach(()=> {
    //Board.js inputValidation DB mock calls
    jest.spyOn(utils.models.Players, "findOne").mockResolvedValue(createFakePlayer());
    jest.spyOn(utils.models.Classes,"findByPk").mockResolvedValue(createFakeClass());
    jest.spyOn(utils.models.Tiles,"findByPk").mockResolvedValue(createFakeTile());
    //Board.js logic DB mock calls
    jest.spyOn(utils.models.Layers, "findAll").mockResolvedValue([{Layer_ID: 1},{Layer_ID: 2},{Layer_ID: 3},{Layer_ID: 4}])
    //utils.GenerateGameGridImage() DB mock calls
    jest.spyOn(utils.models.Tiles,"findAll").mockResolvedValue(createFakeEmptyPlaystate().tiles);
    jest.spyOn(utils.models.Layers, "findByPk").mockResolvedValue(createFakeLayer())
    jest.spyOn(utils.models.Players, "findByPk").mockResolvedValue(createFakePlayer());
    jest.spyOn(utils.models.Classes,"findOne").mockResolvedValue(createFakeClass());

  })

  it('[board 1-1]: creates image buffer properly', async () => {

    var result = await board.logic({commonOrDB: false, gameId: 1, layer: 1, player: createFakePlayer({ Game_ID: 1 })})
    expect(result.toJSON()).toEqual(blankBoard10)
  })
  // it(`[board 1-2]: throws properly when encountering an error`, () => {})
  // it.each([
  //   //test #, commonOrDB, gamestate, implicit Or (not) allowed Explicit Layer_ID, initalizing class, implicit Or Explicit Game_ID, 
  //   [3, false, utils.GAMESTATES.REGISTRATION, 1, createFakeClass({Class_Name: 'Oracle'}), 1],
  //   [4, false, utils.GAMESTATES.REGISTRATION, 1, createFakeClass({Class_Name: 'Oracle'}), null],
  //   [5, false, utils.GAMESTATES.REGISTRATION, 1, createFakeClass({Class_Name: 'Minesweeper'}), 1],
  //   [6, false, utils.GAMESTATES.REGISTRATION, 1, createFakeClass({Class_Name: 'Minesweeper'}), null],
  //   [7, false, utils.GAMESTATES.REGISTRATION, 1, createFakeClass(), 1],
  //   [8, false, utils.GAMESTATES.REGISTRATION, 1, createFakeClass(), null],
  //   [9, false, utils.GAMESTATES.REGISTRATION, null, createFakeClass({Class_Name: `Oracle`}), 1],
  //   [10, false, utils.GAMESTATES.REGISTRATION, null, createFakeClass({Class_Name: 'Minesweeper'}), 1],
  //   [11, false, utils.GAMESTATES.REGISTRATION, null, createFakeClass({Class_Name: 'Minesweeper'}), null],
  //   [12, false, utils.GAMESTATES.REGISTRATION, null, createFakeClass(), null],
  // ])(`[board 1-%i]: `, () => {

  // })
  // describe('board edge cases', () => {

  // })
})



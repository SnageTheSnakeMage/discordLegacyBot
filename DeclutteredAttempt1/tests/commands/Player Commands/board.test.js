/**
 * Unit tests for the board command.
 */
jest.mock('../../../utils')
const { createFakeGame, createFakePlayer, createFakeClass, createFakeTile, createFakePopulatedPlaystate, createFakeLayer, createMockModels, createFakeEmptyPlaystate } = require('../../helpers/mockModels');
const utils = require('../../../utils');
const board = require('../../../commands/Player Commands/board');
const blankBoard10 = require('../../testFiles/10x10Blank1Board.json')


describe('[board 1]: use cases', () => {
  const verifiedInputs = {
    commonOrDB: false,
    gameId: 1,
    layer: 1,
    player: createFakePlayer({ Game_ID: 1 }),
  }
  
  beforeEach(()=> {
  })

  it('[board 1-1]: creates image buffer properly', async () => {
    jest.spyOn(utils.models.Players, "findOne").mockResolvedValue(createFakePlayer());
    jest.spyOn(utils.models.Players, "findByPk").mockResolvedValue(createFakePlayer());
    jest.spyOn(utils.models.Classes,"findByPk").mockResolvedValue(createFakeClass());
    jest.spyOn(utils.models.Classes,"findOne").mockResolvedValue(createFakeClass());
    jest.spyOn(utils.models.Tiles,"findByPk").mockResolvedValue(createFakeTile());
    jest.spyOn(utils.models.Tiles,"findAll").mockResolvedValue(createFakeEmptyPlaystate().tiles);
    jest.spyOn(utils.models.Layers, "findByPk").mockResolvedValue(createFakeLayer())
    jest.spyOn(utils.models.Layers, "findAll").mockResolvedValue([
      {Layer_ID: 1},
      {Layer_ID: 2},
      {Layer_ID: 3},
      {Layer_ID: 4},
  ])
    jest.spyOn(utils.models.Layers,"findOne").mockResolvedValue({ Layer_ID: 1 });
    var result = await board.logic(verifiedInputs)
    expect(result.toJSON()).toEqual(blankBoard10)
  })

  // describe('board edge cases', () => {

  // })
})



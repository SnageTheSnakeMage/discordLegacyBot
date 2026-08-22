jest.mock('../utils')
const utils = require('../utils')
const { createFakeLayer, createMockModels } = require('../tests/helpers/mockModels')

describe('dbLayerIdToCommonLayerId and commonLayerIdToDbLayerId helper function tests', () => {
    beforeEach(() => {
        const models = createMockModels()
        jest.spyOn(models.Layers, "findAll").mockResolvedValue([
            {Layer_ID: 1},
            {Layer_ID: 2},
            {Layer_ID: 3},
            {Layer_ID: 4},
        ])
    })

    it('utils.commonLayerIDtoDbLayerID sucesfully converts a common layer id to a database layer id', () => {
        expect(utils.commonLayerIDtoDbLayerID(1,3)).toBe(3)
    })
})

jest.mock('../utils')
const utils = require('../utils')
const { createFakeLayer, createMockModels } = require('../tests/helpers/mockModels')

describe(`getTileCordinatesOfLine tests`, () => {
    it(`accurately gets distance of orthoginal lines`, () => {
        expect(utils.getTileCordinatesOfLine([3,3],[5,3])).toStrictEqual([[3,3],[4,3],[5,3]])
        expect(utils.getTileCordinatesOfLine([3,3],[1,3])).toStrictEqual([[3,3],[2,3],[1,3]])
        expect(utils.getTileCordinatesOfLine([3,3],[3,5])).toStrictEqual([[3,3],[3,4],[3,5]])
        expect(utils.getTileCordinatesOfLine([3,3],[3,1])).toStrictEqual([[3,3],[3,2],[3,1]])
    })
    it(`accurately gets distance of diagonal lines`, () => {
        expect(utils.getTileCordinatesOfLine([3,3],[5,5])).toStrictEqual([[3,3],[4,4],[5,5]])
        expect(utils.getTileCordinatesOfLine([3,3],[6,4])).toStrictEqual([[3,3],[4,3],[5,4],[6,4]])
        //TODO MAKE A TRACE COMMAND SO PEOPLE CAN SEE THE PATH OF A SHOT BEFORE THEY SPEND AP ON IT
        expect(utils.getTileCordinatesOfLine([3,3],[6,2])).toStrictEqual([[3,3],[4,3],[5,3],[6,2]])
        expect(utils.getTileCordinatesOfLine([3,3],[5,1])).toStrictEqual([[3,3],[4,2],[5,1]])
        expect(utils.getTileCordinatesOfLine([3,3],[4,1])).toStrictEqual([[3,3],[4,2],[4,1]])
        expect(utils.getTileCordinatesOfLine([3,3],[2,1])).toStrictEqual([[3,3],[3,2],[2,1]])
        expect(utils.getTileCordinatesOfLine([3,3],[1,1])).toStrictEqual([[3,3],[2,2],[1,1]])
        expect(utils.getTileCordinatesOfLine([3,3],[1,2])).toStrictEqual([[3,3],[2,3],[1,2]])
        expect(utils.getTileCordinatesOfLine([3,3],[1,4])).toStrictEqual([[3,3],[2,4],[1,4]])
        expect(utils.getTileCordinatesOfLine([3,3],[1,5])).toStrictEqual([[3,3],[2,4],[1,5]])
        expect(utils.getTileCordinatesOfLine([3,3],[2,5])).toStrictEqual([[3,3],[3,4],[2,5]])
        expect(utils.getTileCordinatesOfLine([3,3],[4,5])).toStrictEqual([[3,3],[4,4],[4,5]])
    })
})

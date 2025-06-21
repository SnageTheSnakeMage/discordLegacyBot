const str = "left,3;right,6;up,9";
const array = str.split(';').map(row => row.split(','));
console.log(array[1]);
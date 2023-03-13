var string = ''
    factorsOfLimit = 9,
    levelsOfLimit = 11;
for (var i = 1; i <= factorsOfLimit; i++) {
    for (var j = 1; j <= levelsOfLimit; j++) {
        string += 'aroai_construction_limit_' + i + '_' + j + ' = { ' 
        + 'value = aroai_simultaneous_constructions multiply = ';
        if (i >= 5) {
            string += (Math.round((((0.12 * ((levelsOfLimit - j) * (levelsOfLimit - j) * 0.01 + (levelsOfLimit - j) * 0.15 + 1)) * (1 + ((i - 5) * 0.125))) + Number.EPSILON) * 1000) / 1000);
        } else {
            string += (Math.round((((0.12 * ((levelsOfLimit - j) * (levelsOfLimit - j) * 0.01 + (levelsOfLimit - j) * 0.15 + 1)) * (1 + ((i - 5) * 0.125))) + Number.EPSILON) * 1000) / 1000);
        }
        string += ' round = yes add = 1 }\n';
    }
}
console.log(string);
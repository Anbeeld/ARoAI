var string = '',
    maxInnovation = 999,
    iterationWeeks = 4;
string += `
aroai_add_progress_to_technology = {
    switch = {
        trigger = aroai_rounded_up_innovation`;
    for (i = 1; i <= maxInnovation; i++) { string += `
        `
        + i
        + ` = { add_technology_progress = { technology = $technology$ progress = `
        + (i * iterationWeeks) + ` } }`;
    } string += `
        fallback = { add_technology_progress = { technology = $technology$ progress = `
        + ((maxInnovation + 1) * iterationWeeks)
        + ` } }
    }
}`;
string = string.substring(1);
console.log(string);
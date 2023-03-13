var string = '', part = '', free = '', dc = 5 /* Default crucial */;

var compatibilityPatchID = 1; // Change this to ID that you registered in https://github.com/Anbeeld/ARoAI/issues/4

// Insert building table here before executing the code

/*

Example table of buildings.
You can read what these attributes mean in /tools/buildings.js
To get ID for a building you need to register it in https://github.com/Anbeeld/ARoAI/issues/5

var buildings = [ '',
//  [0]                                            [1]   [2]   [3]     [4]   [5]   [6]   [7]     [8]     [9]     [10]
//  key                                            id    class counter order limit cruc  wforce  alloc   branch  scaling
    ["building_synthetic_oil_plants",              201,  4,    12,     6,    5,    11,   true,   false,  true,   true],
    ["building_synthetic_rubber_plants",           202,  4,    11,     7,    5,    11,   true,   false,  true,   true],
];

*/

classes = ['',
//  [0]                   [1]   [2]
//  group                 id    allocate
    ["government",        1,    1],
    ["infrastructure",    2,    1],
    ["military",          3,    2],
    ["resource",          4,    2],
    ["agriculture",       5,    2],
    ["industry",          6,    2],
]

/*
    Place result code below into an end of the zzz_aroai_compatibility_X_effects.txt file
*/

string += `
# -----------------------------------------------------------------------------------
# Effects below were generated with a modding tool and should not be changed manually
# -----------------------------------------------------------------------------------\n`;

string += `
aroai_add_to_list_of_compatibility_patches_` + compatibilityPatchID + ` = {
    add_to_global_variable_list = {
        name = aroai_compatibility_patches
        target = ` + compatibilityPatchID + `
    }
}\n`;

string += `
aroai_perform_for_every_building_type_` + compatibilityPatchID + ` = {`;
    for (var i = 1; i < buildings.length; i++) {
    string += `
    aroai_perform_for_building_type = {`
    + ` effect = $effect$`
    + ` key = ` + buildings[i][0]
    + ` id = ` + buildings[i][1];
    string += `
    class = ` + buildings[i][2]
    + ` counter = ` + (buildings[i][3] === false ? buildings[i][1] : buildings[i][3])
    + ` order = ` + buildings[i][4]
    + ` limit = ` + buildings[i][5]
    + ` crucial = ` + buildings[i][6]
    + ` workforce = ` + (buildings[i][7] === true ? '1' : '0')
    + ` allocate = ` + (buildings[i][8] === false ? classes[buildings[i][2]][2] : buildings[i][8])
    + ` branching = ` + (buildings[i][9] === true ? '1' : '0')
    + ` scaling = ` + (buildings[i][10] === true ? '1' : '0')
    + ` }`;
    } string += `
}\n`;

/*
    Place result code below into an end of the zzz_aroai_compatibility_X_triggers.txt file
*/

string += `
# ------------------------------------------------------------------------------------
# Triggers below were generated with a modding tool and should not be changed manually
# ------------------------------------------------------------------------------------\n`;

string += `
aroai_is_true_for_any_building_type_` + compatibilityPatchID + ` = {
    OR = {`;
        for (var i = 1; i < buildings.length; i++) {
        string += `
        aroai_is_true_for_building_type = {`
        + ` trigger = $trigger$`
        + ` key = ` + buildings[i][0]
        + ` id = ` + buildings[i][1];
        string += `
        class = ` + buildings[i][2]
        + ` counter = ` + (buildings[i][3] === false ? buildings[i][1] : buildings[i][3])
        + ` order = ` + buildings[i][4]
        + ` limit = ` + buildings[i][5]
        + ` crucial = ` + buildings[i][6]
        + ` workforce = ` + (buildings[i][7] === true ? '1' : '0')
        + ` allocate = ` + (buildings[i][8] === false ? classes[buildings[i][2]][2] : buildings[i][8])
        + ` branching = ` + (buildings[i][9] === true ? '1' : '0')
        + ` scaling = ` + (buildings[i][10] === true ? '1' : '0')
        + ` }`;
        } string += `
    }
}\n`;

console.log(string.substring(1)); // Remove line break at the start
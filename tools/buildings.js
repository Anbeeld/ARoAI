var string = '', part = '', free = '', dc = 5 /* Default crucial */, numCompatibilityPatches = 200;

var buildings = [ '',
//  [0]                                            [1]   [2]   [3]     [4]   [5]   [6]   [7]     [8]     [9]     [10]
//  key                                            id    class counter order limit cruc  wforce  alloc   branch  scaling
    ["building_government_administration",         1,    1,    false,  2,    4,    10,   false,  4,      false,  false],
    ["building_university",                        2,    1,    false,  9,    3,    8,    false,  false,  true,   false],
    ["building_construction_sector",               3,    2,    false,  1,    5,    dc,   false,  false,  true,   false],
    ["building_railway",                           4,    2,    false,  3,    5,    99,   false,  7,      false,  false],
    ["building_port",                              5,    2,    false,  3,    3,    99,   false,  5,      false,  false],
    ["building_barracks",                          6,    3,    false,  9,    8,    8,    false,  2,      false,  false],
    ["building_naval_base",                        7,    3,    false,  9,    5,    8,    false,  2,      false,  false],
    ["building_logging_camp",                      8,    4,    false,  5,    5,    dc,   true,   false,  true,   true],
    ["building_fishing_wharf",                     9,    4,    false,  13,   5,    dc,   true,   false,  true,   true],
    ["building_whaling_station",                   10,   4,    false,  5,    5,    dc,   true,   false,  true,   true],
    ["building_rubber_plantation",                 11,   4,    false,  6,    5,    11,   true,   false,  true,   true],
    ["building_oil_rig",                           12,   4,    false,  4,    5,    11,   false,  false,  true,   true],
    ["building_coal_mine",                         13,   4,    false,  5,    5,    dc,   true,   false,  true,   true],
    ["building_iron_mine",                         14,   4,    false,  5,    5,    dc,   true,   false,  true,   true],
    ["building_lead_mine",                         15,   4,    false,  6,    5,    dc,   true,   false,  true,   true],
    ["building_sulfur_mine",                       16,   4,    false,  5,    5,    dc,   true,   false,  true,   true],
    ["building_gold_mine",                         17,   4,    false,  11,   5,    5,    true,   false,  true,   true],
    ["building_rye_farm",                          18,   5,    false,  10,   5,    dc,   true,   false,  true,   true],
    ["building_wheat_farm",                        19,   5,    18,     10,   5,    dc,   true,   false,  true,   true],
    ["building_rice_farm",                         20,   5,    18,     10,   5,    dc,   true,   false,  true,   true],
    ["building_maize_farm",                        21,   5,    18,     10,   5,    dc,   true,   false,  true,   true],
    ["building_millet_farm",                       22,   5,    18,     10,   5,    dc,   true,   false,  true,   true],
    ["building_livestock_ranch",                   23,   5,    false,  5,    5,    dc,   true,   false,  true,   true],
    ["building_cotton_plantation",                 24,   5,    23,     5,    5,    dc,   true,   false,  true,   true],
    ["building_dye_plantation",                    25,   5,    false,  11,   5,    dc,   true,   false,  true,   true],
    ["building_silk_plantation",                   26,   5,    false,  11,   5,    dc,   true,   false,  true,   true],
    ["building_banana_plantation",                 27,   5,    false,  13,   5,    dc,   true,   false,  true,   true],
    ["building_sugar_plantation",                  28,   5,    false,  13,   5,    dc,   true,   false,  true,   true],
    ["building_tea_plantation",                    29,   5,    false,  15,   5,    dc,   true,   false,  true,   true],
    ["building_coffee_plantation",                 30,   5,    false,  15,   5,    dc,   true,   false,  true,   true],
    ["building_tobacco_plantation",                31,   5,    false,  14,   5,    dc,   true,   false,  true,   true],
    ["building_opium_plantation",                  32,   5,    false,  11,   5,    dc,   true,   false,  true,   true],
    ["building_food_industry",                     33,   6,    false,  14,   5,    dc,   true,   false,  true,   true],
    ["building_textile_mills",                     34,   6,    false,  12,   5,    dc,   true,   false,  true,   true],
    ["building_furniture_manufacturies",           35,   6,    false,  12,   5,    dc,   true,   false,  true,   true],
    ["building_glassworks",                        36,   6,    false,  7,    5,    dc,   true,   false,  true,   true],
    ["building_tooling_workshops",                 37,   6,    false,  4,    5,    dc,   true,   false,  true,   true],
    ["building_paper_mills",                       38,   6,    false,  6,    5,    dc,   true,   false,  true,   true],
    ["building_chemical_plants",                   39,   6,    false,  6,    5,    dc,   true,   false,  true,   true],
    ["building_synthetics_plants",                 40,   6,    25,     12,   5,    dc,   true,   false,  true,   true],
    ["building_steel_mills",                       41,   6,    false,  6,    5,    dc,   true,   false,  true,   true],
    ["building_motor_industry",                    42,   6,    false,  7,    5,    dc,   true,   false,  true,   true],
    ["building_shipyards",                         43,   6,    false,  8,    5,    dc,   true,   false,  true,   true],
    ["building_power_plant",                       44,   6,    false,  4,    5,    dc,   true,   false,  true,   true],
    ["building_electrics_industry",                45,   6,    false,  8,    5,    dc,   true,   false,  true,   true],
    ["building_arms_industry",                     46,   6,    false,  7,    5,    dc,   true,   false,  true,   true],
    ["building_munition_plants",                   47,   6,    false,  7,    5,    dc,   true,   false,  true,   true],
    ["building_war_machine_industry",              48,   6,    false,  8,    5,    dc,   true,   false,  true,   true],
    ["building_arts_academy",                      49,   6,    false,  15,   5,    dc,   true,   false,  true,   true],
];

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

[0] Key         Building key as in game files.
[1] ID          Unique identification number. Required cause building key is a text so it can't be stored in variables.
[2] Class       ...that the building belongs to. Based on building groups as in game files, but classes are more broad.
[3] Counter     Is used to stop script from queueing the same building after X times. Usually counter = id, but some
                buildings share the same counter for all of them if they produce the same goods, e.g. farms.
[4] Order       When buildings have the same priority, they are queued based on this order value. It's here mostly to
                solve dependencies, e.g. tools before mines, mines before industries etc.
[5] Limit       Setting to change the limit of queueing the same building, see Counter. Can be set on scale from 1 to 9,
                where 5 is default, smaller values reduces the limit, higher values increase it.
[6] Crucial     Rating of how crucial this building is for country and economy. When priority <= crucial, many
                of the usual limitations are partially or fully ignored to construct this building at any cost.
[7] Workforce   Determines if workforce limitations are applied to this building, 0 = false, 1 = true. E.g. if we need
                railways due to market access going down we don't really care if there is free workforce right now.
[8] Allocate    Informs the script on how much aptitude levels are there in allocate trigger of this building. E.g. if
                allocate trigger of the building have some conditions for $aptitude$ = 1 and $aptitude$ = 2, then this
                allocate field must be set to 2. If set to False it'll default to allocate value of building's class.
[9] Branching   Are states getting filtered by stuff like being incorporated for this building? 0 = false, 1 = true.
[10] Scaling    Does economy of scale apply to this building? 0 = false, 1 = true.


ORDER OF BUILDINGS
1) construction_sector
2) government_administration
3) railway, port
4) oil_rig, tooling_workshops, power_plant
5) logging_camp, whaling_station, coal_mine, iron_mine, sulfur_mine, livestock_ranch, cotton_plantation
6) lead_mine, rubber_plantation, paper_mills, chemical_plants, steel_mills
7) glassworks, motor_industry, arms_industry, munition_plants
8) electrics_industry, war_machine_industry, shipyards
9) university, barracks, naval_base
10) wheat_farm, rye_farm, rice_farm, maize_farm, millet_farm
11) gold_mine, dye_plantation, opium_plantation, silk_plantation
12) textile_mills, furniture_manufacturies, synthetics_plants
13) fishing_wharf, banana_plantation, sugar_plantation
14) tobacco_plantation, food_industry
15) tea_plantation, coffee_plantation, arts_academy

*/

/*
    Place result code below into an end of the aroai_static_data_effects.txt file
*/

string += `
# -----------------------------------------------------------------------------------
# Effects below were generated with a modding tool and should not be changed manually
# -----------------------------------------------------------------------------------\n`;

string += `
aroai_construct_special_buildings_compatibility = {
    every_in_global_list = {
        variable = aroai_compatibility_patches
        switch = {
            trigger = this`;
    for (var i = 1; i <= numCompatibilityPatches; i++) {
        part += i + ` = { aroai_construct_special_buildings_` + i + ` = yes }`;
        if (i % 2 == 0 || i == numCompatibilityPatches) {
            string += '\n            ' + part.replace(/\n/g, ' ').replaceAll('    ', ' ').replace(/\s\s+/g, ' ');
            part = '';
        } else {
            part += ' ';
        }
    } string += `
        }
    }
}\n`;

for (var i = 1; i <= numCompatibilityPatches; i++) {
    part += `aroai_construct_special_buildings_` + i + ` = {}`;
    if (i % 2 == 0 || i == numCompatibilityPatches) {
        string += '\n' + part.replace(/\n/g, ' ').replaceAll('    ', ' ').replace(/\s\s+/g, ' ');
        part = '';
    } else {
        part += ' ';
    }
}
string += '\n';

string += `
aroai_perform_for_every_building_type = {`;
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
    if = {
        limit = {
            aroai_is_using_compatibility_patches = yes
        }
        aroai_perform_for_every_building_type_compatibility = { effect = $effect$ }
    }
}\n`;

string += `
aroai_perform_for_every_building_type_compatibility = {
    every_in_global_list = {
        variable = aroai_compatibility_patches
        switch = {
            trigger = this`;
        for (var i = 1; i <= numCompatibilityPatches; i++) {
            string += `
            ` + i + ` = { prev = { aroai_perform_for_every_building_type_` + i + ` = { effect = $effect$ } } }`;
        } string += `
        }
    }
}\n`;

for (var i = 1; i <= numCompatibilityPatches; i++) {
    string += `\naroai_perform_for_every_building_type_` + i + ` = { if = { limit = { always = no $effect$ = 0 } } }`;
}
string += '\n';

/*
    Place result code below into an end of the aroai_static_data_triggers.txt file
*/

string += `
# ------------------------------------------------------------------------------------
# Triggers below were generated with a modding tool and should not be changed manually
# ------------------------------------------------------------------------------------\n`;

string += `
aroai_is_true_for_any_building_type = {
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
        AND = {
            aroai_is_using_compatibility_patches = yes
            aroai_is_true_for_any_building_type_compatibility = { trigger = $trigger$ }
        }
    }
}\n`;

string += `
aroai_is_true_for_any_building_type_compatibility = {
    OR = {`;
    for (var i = 1; i <= numCompatibilityPatches; i++) {
        string += `
        aroai_is_true_for_any_building_type_` + i + ` = { trigger = $trigger$ }`;
    } string += `
    }
}\n`;

for (var i = 1; i <= numCompatibilityPatches; i++) {
    string += `\naroai_is_true_for_any_building_type_` + i + ` = { always = no $trigger$ = 0 }`;
}

console.log(string.substring(1)); // Remove line break at the start
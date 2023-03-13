var string = '';
string += `
aroai_check_if_counter_is_within_limit = {
    OR = {
        NOT = {
            has_variable = aroai_building_type_$counter$_collected_data
        }
        switch = {
            trigger = aroai_building_type_$id$_collected_data_average_of_1_and_2`;
        for (var i = 1; i <= 11; i++) {
            string += `
            ` + (i < 11 ? i : `fallback`) + ` = { aroai_building_type_$counter$_collected_data_5 < aroai_construction_limit_$limit$_` + i + ` }`;
        } string += `
        }
    }
}`;
console.log(string.substring(1));
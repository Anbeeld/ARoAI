var string = '',
    part = '';
string += `
aroai_filter_and_sort_states_from_allocation_lists = {
    if = {
        limit = {
            $branching$ = 0
        }\n`;
    for (var i = 1; i <= 10; i++) { part += `
        if = {
            limit = {
                has_variable_list = aroai_building_type_$id$_allocation_` + i;
            if (i > 1) { part += `
                aroai_check_if_counter_is_within_limit = {
                    id = $id$
                    counter = $counter$
                    limit = $limit$
                }`;
            } part += `
            }
            every_in_list = {
                variable = aroai_building_type_$id$_allocation_` + i + `
                limit = {
                    NOT = {
                        aroai_requirements_for_construction_in_state = {
                            id = $id$
                            class = $class$
                            workforce = $workforce$
                            crucial = $crucial$
                        }
                    }
                }
                root = {
                    remove_list_variable = {
                        name = aroai_building_type_$id$_allocation_` + i + `
                        target = prev
                    }
                }
            }
            if = {
                limit = {
                    has_variable_list = aroai_building_type_$id$_allocation_` + i + `
                }
                aroai_start_building_construction = {
                    states = aroai_building_type_$id$_allocation_` + i + `
                    key = $key$
                    id = $id$
                    class = $class$
                    counter = $counter$
                    scaling = $scaling$
                    limit = $limit$
                    workforce = $workforce$
                    crucial = $crucial$
                }
            }
        }`;
    }
    string += part.substring(1)/*.replace(/\n/g, ' ').replaceAll('    ', ' ').replace(/\s\s+/g, ' ')*/;
    part = '';
    string += `
    }
    else = {`;
for (var i = 1; i <= 10; i++) {
    string += `
        `;
    if (i > 1) {
        string += `else_`;
    }
    string += `if = {
            limit = {
                $allocate$ = ` + i + `
            }\n`;
        for (var j = 1; j <= i; j++) { part += `
            aroai_perform_branching_of_allocation_list = {
                id = $id$
                class = $class$
                workforce = $workforce$
                crucial = $crucial$
                index_1 = ` + j + `
                index_2 = ` + (i + j) + `
                index_3 = ` + ((i * 2) + j) + `
                index_4 = ` + ((i * 3) + j) + `
            }`;
        }
        for (var j = 1; j <= i * 4; j++) { part += `
            if = {
                limit = {
                    has_variable_list = aroai_building_type_$id$_branch_` + j;
                if (j > 1) { part += `
                    aroai_check_if_counter_is_within_limit = {
                        id = $id$
                        counter = $counter$
                        limit = $limit$
                    }`;
                } part += `
                } 
                aroai_start_building_construction = {
                    states = aroai_building_type_$id$_branch_` + j + `
                    key = $key$
                    id = $id$
                    class = $class$
                    counter = $counter$
                    scaling = $scaling$
                    limit = $limit$
                    workforce = $workforce$
                    crucial = $crucial$
                }
            }`;
        }
        for (var j = 1; j <= i; j++) { part += `
            clear_variable_list = aroai_building_type_$id$_branch_` + (j * 4 - 3) + `
            clear_variable_list = aroai_building_type_$id$_branch_` + (j * 4 - 2) + `
            clear_variable_list = aroai_building_type_$id$_branch_` + (j * 4 - 1) + `
            clear_variable_list = aroai_building_type_$id$_branch_` + (j * 4);
        }
        string += part.substring(1)/*.replace(/\n/g, ' ').replaceAll('    ', ' ').replace(/\s\s+/g, ' ')*/;
        part = '';
    string += `
        }`;
}
string += `
    }
}`;
console.log(string);
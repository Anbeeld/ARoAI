var string = `aroai_fix_error_log_complaining_about_variables = {
    add_to_global_variable_list = {
        name = aroai_compatibility_patches
        target = 0
    }\n`,
    numVariables = 500
    lineBreakFrequency = 2;
for (var i = 1; i <= numVariables; i++) {
    string += ((i - 1) % lineBreakFrequency == 0 ? '    ' : '')
            + 'set_variable = aroai_building_type_' + i + '_collected_data'
            + (i % lineBreakFrequency == 0 || i == numVariables ? '\n' : ' ');
}
string += '}';
console.log(string);
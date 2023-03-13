var string = `aroai_refresh_list_of_compatibility_patches = {
    clear_global_variable_list = aroai_compatibility_patches\n`,
    numCompatibilityPatches = 200
    lineBreakFrequency = 2;
for (var i = 1; i <= numCompatibilityPatches; i++) {
    string += ((i - 1) % lineBreakFrequency == 0 ? '    ' : '')
            + 'aroai_add_to_list_of_compatibility_patches_' + i + ' = yes'
            + (i % lineBreakFrequency == 0 || i == numCompatibilityPatches ? '\n' : ' ');
}
string += '}\n\n';
for (var i = 1; i <= numCompatibilityPatches; i++) {
    string += ((i - 1) % lineBreakFrequency == 0 ? '' : '')
            + 'aroai_add_to_list_of_compatibility_patches_' + i + ' = {}'
            + (i % lineBreakFrequency == 0 || i == numCompatibilityPatches ? '\n' : ' ');
}
console.log(string);
var string = '',
    numVariables = 500;
for (var i = 1; i <= numVariables; i++) {
string += 'aroai_building_type_' + i + '_collected_data_1 = { value = var:aroai_building_type_' + i + '_collected_data\n'
+ 'subtract = { value = var:aroai_building_type_' + i + '_collected_data floor = yes } multiply = 100 }\n'
+ 'aroai_building_type_' + i + '_collected_data_2 = { value = var:aroai_building_type_' + i + '_collected_data\n'
+ 'subtract = { value = var:aroai_building_type_' + i + '_collected_data divide = 100 floor = yes multiply = 100 } floor = yes }\n'
+ 'aroai_building_type_' + i + '_collected_data_3 = { value = var:aroai_building_type_' + i + '_collected_data\n'
+ 'subtract = { value = var:aroai_building_type_' + i + '_collected_data divide = 1000000 floor = yes multiply = 1000000 }\n'
+ 'divide = 100 floor = yes }\n'
+ 'aroai_building_type_' + i + '_collected_data_4 = { value = var:aroai_building_type_' + i + '_collected_data\n'
+ 'subtract = { value = var:aroai_building_type_' + i + '_collected_data divide = 10000000 floor = yes multiply = 10000000 }\n'
+ 'divide = 1000000 floor = yes }\n'
+ 'aroai_building_type_' + i + '_collected_data_5 = { value = var:aroai_building_type_' + i + '_collected_data\n'
+ 'divide = 10000000 floor = yes }\n'
+ 'aroai_building_type_' + i + '_collected_data_average_of_1_and_2 = { value = aroai_building_type_' + i + '_collected_data_1\n'
+ 'add = aroai_building_type_' + i + '_collected_data_2 divide = 2 floor = yes }'
+ (i < numVariables ? "\n" : "");
}
console.log(string);
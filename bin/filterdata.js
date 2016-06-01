#!/usr/bin/env node --harmony

var program = require('commander');
var fs = require('fs');
var chalk = require('chalk');
var JSONStream = require('JSONStream');

const DAY_IN_MILLI = 86400000.0;

program
    .version('0.0.1')
    .arguments('<type>')
    .option('-i, --input <input>', 'path/to/input.json')
    .option('-o, --output <output>', 'path/to/output.json')
    .option('--length <length>', 
    	'Number of contiguous days, regardless of data. Default is 1 day.',
    	Number, 1)
    .option('--min <min>', 
    	'Minimum number of events per day to be a qualifying day.' 
    	+ ' Default is 1 event.',
    	Number, 1)
    .option('--days <days>', 
    	'Minimum number of days with <min> events. Default is 1 day.',
    	Number, 1)
    .option('--gap <gap>',
    	'Maximum gap of unqualifying days in <length> contiguous days.'
    	+ ' Default is 1 day.',
    	Number, 1)
    // .option('--date <date>', 'Doesn\'t do anything... yet.')
    // .option('--forwards', 
    // 	'If present, works forwards in time instead of backwards.')
    .option('-v, --verbose', 'Verbose output.')
    .option('-d, --debug', 'Debugging logging.')
	.action(function(type) {
		program.type = type;
    })
    .parse(process.argv);

performDataFiltering(function() { });

function performDataFiltering(callback) {

	if (program.verbose) {
		console.log(chalk.green.bold('Options:'))
		printOptions();
		console.log(chalk.yellow.bold('\nReading input...'));
	}

	var ifs = makeInFileStream();

	var jsonStream = JSONStream.parse();

	var ofs = makeOutstream();

	ifs
		.pipe(jsonStream)
		.on('data', function (chunk) {
			if (program.verbose) {
				console.log(chalk.yellow.bold('Done reading input. Sorting data...'));
			}

			chunk.sort(function(a, b) {
				return new Date(b.time).getTime() - new Date(a.time).getTime();
			});

			if (program.verbose) {
				console.log(chalk.yellow.bold('Done sorting. Filtering...'));
			}

		    var toAdd = [];
		    var i = getFirstIndexOfTypeWithExit(0, program.type, chunk);
			var curSet = {
				start: new Date(chunk[i].time),
				// lastData: null,
				end: new Date(chunk[i].time)
			};
			totalBack = 0;

		    while(i < chunk.length) {

		    	toAdd.push(JSON.stringify(chunk[i]));
		    	curSet.end = new Date(chunk[i].time);

		    	i = getFirstIndexOfType(i + 1, program.type, chunk);
		    	if (i === chunk.length) break;

		    	var nextTime = new Date(chunk[i].time);
		    	var gap = (curSet.end.getTime() - nextTime.getTime()) / DAY_IN_MILLI;
		    	var length = (curSet.start.getTime() - curSet.end.getTime()) / DAY_IN_MILLI;

		    	if (gap > program.gap && length > program.length) break;
		    		// && enough coverage
		    	else if (gap > program.gap) {
		    		// || not enough coverage
		    		// start over
		    		totalBack += gap + length;
		    		
		    		if (program.debug) {
			    		console.log(chalk.blue('Starting over because of gap.'));
			    		console.log(chalk.cyan('Current data set length (days): ' + length));
			    		console.log(chalk.cyan('Gap size (days): ' + gap))
			    		console.log(chalk.cyan('Total back in time (days): ' + totalBack));
			    		console.log(chalk.cyan('Current index: ' + i));
			    	}

		    		toAdd = [];
					var curSet = {
						start: new Date(chunk[i].time),
						end: new Date(chunk[i].time)
					};
		    	}

		    }

		    var length = (curSet.start.getTime() - curSet.end.getTime()) / DAY_IN_MILLI;
		    if (program.debug) console.log(chalk.blue('Data set length (days): ' + length));
		    if (length < program.length) {
		    	// || data does not have coverage
    	    	console.log(chalk.red.bold('There was no such data set that fit the criteria.'
							+ ' Terminating program.'));
		    	process.exit(1);
		    }

		    var jsonStr = '[' + toAdd.join(',') + ']\n';

			if (program.verbose) {
				console.log(chalk.yellow.bold('Writing to output...'));
			}
		    writeToOutstream(ofs, jsonStr);
		})
		.on('end', function() {
			if (program.verbose) {
				console.log(chalk.yellow.bold('Done writing to output.'));
			}
			callback();
		});
}

function verifySameDay(d1, d2) {
	return d1.getDate() === d2.getDate()
			&& d1.getMonth() === d2.getMonth()
			&& d1.getYear() === d2.getYear();
}

function getGapFromSet(set) {
	return (set.end.getTime() - set.lastData.getTime())
				/ 86400000.0;
}

function getLengthFromSet(set) {
	return (set.start.getTime() - set.lastData.getTime())
				/ 86400000.0;
}

function getFirstIndexOfType(start, type, data) {
	var i = start;
    while (i < data.length && data[i].type !== type)  i++;
    return i;
}

function getFirstIndexOfTypeWithExit(start, type, data) {
    var i = getFirstIndexOfType(start, type, data);
    if (i === data.length) {
    	console.log(chalk.red.bold('The selected data type does not exist in the data.'
    								+ ' Terminating program.'));
    	process.exit(1);
    }
    return i;
}

function printOptions() {
	console.log(chalk.blue.bold('type: ') + program.type);
	console.log(chalk.blue.bold('input: ') + program.input);
	console.log(chalk.blue.bold('output: ') + program.output);
	console.log(chalk.blue.bold('length: ') + program.length);
	console.log(chalk.blue.bold('min: ') + program.min);
	console.log(chalk.blue.bold('days: ') + program.days);
	console.log(chalk.blue.bold('gap: ') + program.gap);
}

function makeInFileStream() {
	var ifs;
	if (program.input) {
		ifs = fs.createReadStream(program.input, {encoding: 'utf8'});
	} else {
		ifs = process.stdin;
	}
	return ifs;
}

function makeOutstream() {
	var ofs;
	if (program.output) {
		ofs = fs.createWriteStream(program.output);
	} else {
		ofs = process.stdout;
	}
	return ofs
}

function writeToOutstream(ofs, info) {
	if (program.output) {
		ofs.write(info);
	} else {
		console.log(info);
	}
}
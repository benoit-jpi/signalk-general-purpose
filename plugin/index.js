/****************************************************************************
ISC License

Copyright (c) 2025 Jean-Pierre Benoit

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.

*****************************************************************************

Signal K server plugin to compute rateOfTurn from multiple references.

Features:
- Configurable source of reference
      o ['navigation.headingTrue'] => ['default']
      o ['navigation.headingMagnetic']
      o ['navigation.courseOverGroundMagnetic']
      o ['navigation.courseOverGroundTrue']

- Configurable size of the regression array (default 20)

TODO :

*****************************************************************************/
const debug = require("debug")("signalk:signalk-rot-calculations")

degreesToRadians = value => Math.PI / 180 * value
radiansToDegrees = value => 180 / Math.PI * value

function normalize(value) {
    // Normalize the difference to the range [-PI, PI]
    // This finds the shortest path around the circle.
    if (value > Math.PI) {
	value -= 2*Math.PI;
    } else if (value < -Math.PI) {
	value += 2*Math.PI;
    }

    return value;
}

/*
 * @param {number[]} headings
 * @returns {number} the mean into [0, 2*PI]
 */
function computeCircularMean(headings) {
    if (headings.length === 0) {
        return NaN; // No mean if array empty
    }

    let sum_x = 0;
    let sum_y = 0;

    for (const heading of headings) {
        // X component (Cosinus) / Y component (Sinus)
        sum_x += Math.cos(heading);
        sum_y += Math.sin(heading);
    }

    // Compute the means of the components
    const avg_x = sum_x / headings.length;
    const avg_y = sum_y / headings.length;

    // Convert the vector mean into angle
    // Math.atan2(y, x) returns angle in radians
    let mean = Math.atan2(avg_y, avg_x);

    // Normalize the result into [0, 2*PI]
    return normalize(mean);
}

/**
 * Compute the slope of the strait line by mean of a linear regression
 * using the least mean method
 *
 * @param {number[]} time - array of the times (X component)
 * @param {number[]} data - array of the angles (Y component)
 * @returns {number} the slope
 */
function computeSlope(time, data) {
    const N = data.length;

    if (N < 2) {
        console.error("Error : At least two points should be given to compute the slope");
        return NaN; // Not a Number
    }

    let sum_x = 0;       // Sum of the X component
    let sum_y = 0;       // Sum of the Y component
    let sum_xy = 0;      // Sum of the (X * Y)
    let sum_x_squared = 0; // Sum of the (X * X)

    for (let i = 0; i < N; i++) {
        const x = time[i];
        const y = data[i];

        sum_x += x;
        sum_y += y;
        sum_xy += x * y;
        sum_x_squared += x * x;
    }

    // Numerator : N * Sum(XY) - Sum(X) * Sum(Y)
    const numerator = (N * sum_xy) - (sum_x * sum_y);

    // Denominator : N * Sum(X^2) - (Sum(X))^2
    const denominator = (N * sum_x_squared) - (sum_x * sum_x);

    if (denominator === 0) {
        return Infinity;
    }

    const slope = numerator / denominator;

    return slope;
}

function computeROT(times, values) {
    // Compute the slope of the array
    // and divide by the time interval
    let size=values.length;
    const avg = computeCircularMean(values);

    const x0 = times[0];
    // times array mapped to relative instants in seconds
    const mappedTimes = times.map((x) => (x - x0)/1000);
    // values mapped around the average and normalized in [-PI;+PI]
    const mappedValues = values.map((y) => normalize(y - avg));

    // compute the slope with least square method
    return computeSlope(mappedTimes, mappedValues);
}

function sendFilteredValue(app, pluginId, value) {
    try {
	app.handleMessage(pluginId, {
	    updates: [{
		values: [{
		    path: 'navigation.rateOfTurn',
		    value: value
		}]
	    }]
	}, 'v2');

    } catch (err) {
	console.log(err)
    }
}

module.exports = function(app) {

    const unsubscribes = [] // Array to store all disposer functions

    const plugin = {

	id: "sk-rot-calculation",
	name: "ROT-calculation",
	description: "Plugin that computes the self.navigation.rateOfTurn path value",

	schema: function () {
	    const schema = {
		type: "object",
		title: "ROT calculation plugin parameters",
		description: "ROT calculation parameters",
		properties: {	    
		    inputPath: {
			type: 'string',
			title: 'Reference source path',
			default: 'navigation.headingTrue',
			enum: ['navigation.headingTrue',
			       'navigation.headingMagnetic',
			       'navigation.courseOverGroundMagnetic',
			       'navigation.courseOverGroundTrue']
		    },
		    size: {
			type: 'number',
			title: 'Size of the regression array',
			default: 20
		    }
		}
	    }
	    return schema
	},

	start: (options, restartPlugin) => {
	    app.debug('Plugin started')
	    let localSubscription = {
		context: '*', // Get data for all contexts
		subscribe: [
		    {
			path: 'navigation.*', // Get all paths
			period: 5000 // Every 5000ms
		    },
		    {
			path: 'environment.wind.*',
			period: 5000
		    }
		]
	    }

	    app.subscriptionmanager.subscribe(
		localSubscription,
		unsubscribes,
		(subscriptionError) => {
		    app.error('Error:' + subscriptionError)
		},
		(delta) => {
		    delta.updates.forEach((update) => {
			if (update.values) {
			    update.values.forEach((v) => {
				if (v.path === 'navigation.speedOverGround') {
				    app.debug(`Nouvelle vitesse fond : ${v.value} m/s`)
				} else	if (v.path === 'navigation.headingTrue') {
				    app.debug(`Nouveau cap vrai : ${v.value} rad`)
				} else	if (v.path === 'navigation.headingMagnetic') {
				    app.debug(`Nouveau cap magnétique : ${v.value} rad`)
				};
			    });
			}
		    })
		}
	    )
	},

	stop: () => {
	    unsubscribes.forEach((f) => f())
	    unsubscribes.length = 0
	}
	/************************
	start: function (settings, restartPlugin) {
	    
	    app.debug('Plugin started')

	    const inputPath = settings.inputPath
            size = settings.size
	    let times = [];
	    let values = [];

	    const disposer = app.streambundle.getSelfBus(inputPath)
		  .onValue(data => {
		      const currentTime=new Date(data.timestamp).getTime();
		      let currentValue = data.value;

		      times.push(currentTime);
		      values.push(currentValue);

		      if (values.length > size) {
			  // remove the first element
			  times.shift();
			  values.shift();

			  // compute and publish the rateOfTurn
			  sendFilteredValue(app, plugin.id, computeROT(times, values));
		      }

		  });

	    unsubscribes.push(disposer);

	},
	stop: function () {

	    app.debug('Stopping plugin and unsubscribing from all paths...');

	    // Iterate through the array and execute each disposer function
	    unsubscribes.forEach(disposer => {
		if (typeof disposer === 'function') {
		    disposer(); // Execute the function to stop the stream
		}
	    });

	    // Clear the array once done
	    unsubscribes.length = 0;
        }
	*********************/
    }
    return plugin

}

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

Signal K server plugin to perform general purpose testting.

Features:

TODO :

*****************************************************************************/
const debug = require("debug")("signalk:signalk-general-purpose")

degreesToRadians = value => Math.PI / 180 * value
radiansToDegrees = value => 180 / Math.PI * value

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

    // Normalize the result into [-PI, 2*PI]
    return normalize(mean);
}

module.exports = function(app) {

    const unsubscribes = [] // Array to store all disposer functions

    const plugin = {

	id: "sk-general-purpose",
	name: "GP Plugin",
	description: "Plugin used for general purpose testing",

	schema: function () {
	    const schema = {
		type: "object",
		title: "General purpose plugin",
		description: "General purpose testing plugin",
		properties: {
		    size: {
			type: 'number',
			title: 'mean computation array size',
			default: 10
		    },
		    period: {
			type: 'number',
			title: 'Period (ms)',
			default: 1000
		    }
		}
	    }
	    return schema
	},

	start: (options, restartPlugin) => {
	    app.debug('Plugin started')

	    let localSubscription = {
		context: 'self',
		subscribe: [
		    {
			path: 'navigation.position',
			period : options.period
		    },
		    {
			path: 'navigation.speedOverGround',
			period : options.period
		    },
		    {
			path: 'navigation.courseOverGroundTrue',
			period : options.period
		    },
		    {
			path: 'navigation.speedThroughWater',
			period : options.period
		    },
		    {
			path :'environment.wind.speedApparent',
			period : options.period
		    },
		    {
			path :'environment.wind.angleApparent',
			period : options.period
		    },
		    {
			path :'navigation.headingTrue',
			period : options.period
		    },
		    {
			path :'navigation.attitude.roll',
			period : options.period
		    }
		]
	    }

	    let time, lon, lat, sog, cog, stw, aws, awa, hdt, heel;

	    app.subscriptionmanager.subscribe(
		localSubscription,
		unsubscribes,
		(subscriptionError) => {
		    app.error('Error:' + subscriptionError)
		},
		(delta) => {
		    delta.updates.forEach((update) => {
			time=app.getSelfPath('navigation.datetime.value')

			if (update.values) {
			    update.values.forEach((v) => {
				if (v.path === 'navigation.position') {
				    lat=v.value.latitude
				    lon=v.value.longitude
				    app.debug('timestamp:', update.timestamp,', position:', v.value);
				} else	if (v.path === 'navigation.speedOverGround') {
				    sog=v.value
				    app.debug('timestamp:', update.timestamp,', sog:', v.value);
				} else	if (v.path === 'navigation.courseOverGroundTrue') {
				    cog=v.value
				    app.debug('timestamp:', update.timestamp,', cog:', v.value);
				} else if (v.path === 'navigation.speedThroughWater') {
				    stw=v.value
				    app.debug('timestamp:', update.timestamp,', stw:', v.value);
				} else if (v.path === 'environment.wind.speedApparent') {
				    aws=v.value
				    app.debug('timestamp:', update.timestamp,', aws:', v.value);
				} else if (v.path === 'environment.wind.angleApparent') {
				    awa=v.value
				    app.debug('timestamp:', update.timestamp,', awa:', v.value);
				} else if (v.path === 'navigation.headingTrue') {
				    hdt=v.value
				    app.debug('timestamp:', update.timestamp,', hdt:', v.value);
				} else if (v.path === 'navigation.attitude.roll') {
				    heel=v.value
				    app.debug('timestamp:', update.timestamp,', heel:', v.value);
				}
			    });
			}
		    })

		})
	},

	stop: () => {
	    unsubscribes.forEach((f) => f())
	    unsubscribes.length = 0
	}
    }
    return plugin

}

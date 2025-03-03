/**
 * @file MMM-Strava.js
 *
 * @author ianperrin
 * @license MIT
 *
 * @see  https://github.com/ianperrin/MMM-Strava
 */
Module.register("MMM-Strava", {
	// Set the minimum MagicMirror module version for this module.
	requiresVersion: "2.2.0",
	// Default module config.
	defaults: {
		client_id: "",
		client_secret: "",
		mode: "table", // Possible values "table", "chart"
		chartType: "bar", // Possible values "bar", "radial"
		activities: ["ride", "run", "swim"], // Possible values "alpineski", "backcountryski", "canoeing", "crossfit", "ebikeride", "elliptical", "golf", "handcycle", "hike", "iceskate", "inlineskate", "kayaking", "kitesurf", "nordicski", "ride", "rockclimbing", "rollerski", "rowing", "run", "sail", "skateboard", "snowboard", "snowshoe", "soccer", "stairstepper", "standuppaddling", "surfing", "swim", "velomobile", "virtualride", "virtualrun", "walk", "weighttraining", "wheelchair", "windsurf", "workout", "yoga"
		period: "recent", // Possible values "recent", "ytd", "all"
		stats: [], // Possible values "count", "distance", "elevation", "moving_time", "elapsed_time", "achievements"
		auto_rotate: false, // Rotate stats through each period starting from specified period
		locale: config.language,
		units: config.units,
		reloadInterval: 5 * 60 * 1000, // every 5 minutes
		updateInterval: 10 * 1000, // 10 seconds
		animationSpeed: 2.5 * 1000, // 2.5 seconds
		debug: false, // Set to true to enable extending logging
		digits: 1, // digits for distance and elevation
		firstYear: new Date().getFullYear() - 4 // first year to group activities by in chart mode when the period is 'all'
	},
	/**
	 * @member {boolean} loading - Flag to indicate the loading state of the module.
	 */
	loading: true,
	/**
	 * @member {boolean} rotating - Flag to indicate the rotating state of the module.
	 */
	rotating: false,
	/**
	 * @function getStyles
	 * @description Style dependencies for this module.
	 * @override
	 *
	 * @returns {string[]} List of the style dependency filepaths.
	 */
	getStyles: function () {
		return ["font-awesome.css", "MMM-Strava.css"];
	},
	/**
	 * @function getScripts
	 * @description Script dependencies for this module.
	 * @override
	 *
	 * @returns {string[]} List of the script dependency filepaths.
	 */
	getScripts: function () {
		return ["moment.js"];
	},
	/**
	 * @function getTranslations
	 * @description Translations for this module.
	 * @override
	 *
	 * @returns {object.<string, string>} Available translations for this module (key: language code, value: filepath).
	 */
	getTranslations: function () {
		return {
			en: "translations/en.json",
			de: "translations/de.json",
			es: "translations/es.json",
			fr: "translations/fr.json",
			gr: "translations/gr.json",
			hu: "translations/hu.json",
			id: "translations/id.json",
			it: "translations/it.json",
			pt: "translations/pt.json",
			nl: "translations/nl.json",
			ru: "translations/ru.json"
		};
	},
	/**
	 * @function start
	 * @description Validates config values, adds nunjuck filters and initialises requests for data.
	 * @override
	 */
	start: function () {
		Log.info("Starting module: " + this.name);
		// Validate config options
		this.config.mode = this.config.mode.toLowerCase();
		this.config.chartType = this.config.chartType.toLowerCase();
		this.config.activities = this.filterActivities(this.config.activities.map((activity) => activity.toLowerCase()));
		this.config.period = this.config.period.toLowerCase();
		// Set stats defaults based on mode
		if (!this.config.stats || this.config.stats.length === 0) {
			const defaultChartStats = ["distance", "moving_time", "elevation"];
			const defaultTableStats = ["count", "distance", "achievements"];
			this.config.stats = this.config.mode === "chart" ? defaultChartStats : defaultTableStats;
		}
		this.config.stats = this.config.stats.map((stat) => stat.toLowerCase());
		// Add custom filters
		this.addFilters();
		// Initialise helper and schedule api calls
		this.sendSocketNotification("SET_CONFIG", { identifier: this.identifier, config: this.config });
		this.scheduleUpdates();
	},
	/**
	 * @function socketNotificationReceived
	 * @description Handles incoming messages from node_helper.
	 * @override
	 *
	 * @param {string} notification - Notification name
	 * @param {Object,<string,*} payload - Detailed payload of the notification.
	 */
	socketNotificationReceived: function (notification, payload) {
		this.log(`Receiving notification: ${notification} for ${payload.identifier}`);
		if (payload.identifier === this.identifier) {
			if (notification === "DATA") {
				this.stravaData = payload.data;
				this.loading = false;
				this.updateDom(this.config.animationSpeed);
			} else if (notification === "SHOE_DATA") {  // New block for SHOE_DATA
				this.shoeData = payload.data;
				this.loading = false;
				this.updateDom(this.config.animationSpeed);
			} else if (notification === "YEARLY_GOAL_DATA") {  // New block for YEARLY_GOAL_DATA
				console.log("Received yearly goal data in MMM-Strava.js:", payload); // Debugging line
				this.goalData = payload;  // Assign the entire payload as goalData
				this.loading = false;
				this.updateDom(this.config.animationSpeed);
			} else if (notification === "ERROR") {
				this.loading = false;
				this.error = payload.data.message;
				this.updateDom(this.config.animationSpeed);
			} else if (notification === "WARNING") {
				this.loading = false;
				this.sendNotification("SHOW_ALERT", { type: "notification", title: payload.data.message });
			}
		}
	},
	/**
	 * @function getTemplate
	 * @description Nunjuck template.
	 * @override
	 *
	 * @returns {string} Path to nunjuck template.
	 */
	getTemplate: function () {
		return "templates\\MMM-Strava." + this.config.mode + ".njk";
	},
	/**
	 * @function getTemplateData
	 * @description Data that gets rendered in the nunjuck template.
	 * @override
	 *
	 * @returns {string} Data for the nunjuck template.
	 */
	getTemplateData: function () {
		moment.locale(this.config.locale);
		return {
			config: this.config,
			loading: this.loading,
			error: this.error || null,
			data: this.stravaData || {},
			shoeData: this.shoeData || [], // This line ensures shoeData is passed to the template
			goalData: this.goalData || null, // This will be used in MMM-Strava.goal.njk
			chart: { bars: this.config.period === "ytd" ? moment.monthsShort() : moment.weekdaysShort() }
		};
	},
	/**
	 * @function scheduleUpdates
	 * @description Schedules table rotation
	 */
	scheduleUpdates: function () {
		var self = this;
		// Schedule table rotation
		if (!this.rotating && this.config.mode === "table") {
			this.rotating = true;
			if (this.config.auto_rotate && this.config.updateInterval) {
				setInterval(function () {
					// Get next period
					self.config.period = self.config.period === "recent" ? "ytd" : self.config.period === "ytd" ? "all" : "recent";
					self.updateDom(self.config.animationSpeed);
				}, this.config.updateInterval);
			}
		}
	},
	/**
	 * @function log
	 * @description logs the message, prefixed by the Module name, if debug is enabled.
	 * @param  {string} msg            the message to be logged
	 */
	log: function (msg) {
		if (this.config && this.config.debug) {
			Log.info(`${this.name}: ` + JSON.stringify(msg));
		}
	},
	/**
	 * @function filterActivities
	 * @description Removes invalid activity values from an array.
	 *
	 * @param {Object} activityArray - Array of activities to be validated
	 */
	filterActivities: function (activityArray) {
		var validActivities = this.config.mode === "chart" ? activityArray : this.defaults.activities;
		return activityArray.filter(function (activity) {
			return validActivities.indexOf(activity) === -1 ? false : true;
		});
	},
	/**
	 * @function addFilters
	 * @description adds filters to the Nunjucks environment.
	 */
	addFilters() {
		var env = this.nunjucksEnvironment();
		env.addFilter("getIntervalClass", this.getIntervalClass.bind(this));
		env.addFilter("getLabel", this.getLabel.bind(this));
		env.addFilter("formatTime", this.formatTime.bind(this));
		env.addFilter("formatDistance", this.formatDistance.bind(this));
		env.addFilter("formatShoeDistance", this.formatShoeDistance.bind(this)); // Register the new filter for shoe mileage
		env.addFilter("formatElevation", this.formatElevation.bind(this));
		env.addFilter("roundValue", this.roundValue.bind(this));
		env.addFilter("getRadialLabelTransform", this.getRadialLabelTransform.bind(this));
		env.addFilter("getRadialDataPath", this.getRadialDataPath.bind(this));
	},
	/**
	 * @function getIntervalClass
	 * @description returns the CSS Class for the supplied interval based on the config period.
	 */
	getIntervalClass: function (interval) {
		moment.locale(this.config.locale);
		const currentIntervalMap = {
			all: moment().year() - this.config.firstYear,
			ytd: moment().month(),
			recent: moment().weekday()
		};
		var currentInterval = currentIntervalMap[this.config.period];
		var className = "future";
		if (currentInterval === interval) {
			className = "current";
		} else if (currentInterval > interval) {
			className = "past";
		}
		return className;
	},
	getLabel: function (interval) {
		moment.locale(this.config.locale);
		const intervalDateMap = {
			all: moment().year(this.config.firstYear).add(interval, "years").format("YY"),
			ytd: moment().startOf("year").add(interval, "months").format("MMM").slice(0, 1).toUpperCase(),
			recent: moment().startOf("week").add(interval, "days").format("dd").slice(0, 1).toUpperCase()
		};
		return intervalDateMap[this.config.period];
	},
	formatTime: function (timeInSeconds) {
		var duration = moment.duration(timeInSeconds, "seconds");
		return Math.floor(duration.asHours()) + "h " + duration.minutes() + "m";
	},
	// formatDistance
	formatDistance: function (value, digits, showUnits) {
		const distanceMultiplier = this.config.units === "imperial" ? 0.0006213712 : 0.001;
		const distanceUnits = this.config.units === "imperial" ? " mi" : " km";
		return this.formatNumber(value, distanceMultiplier, digits, showUnits ? distanceUnits : null);
	},
	//formationShoeDistance
	formatShoeDistance: function (value, digits, showUnits) {
		const distanceUnits = this.config.units === "imperial" ? " mi" : " km";
		return value.toFixed(digits) + (showUnits ? distanceUnits : "");
	},
	// formatElevation
	formatElevation: function (value, digits, showUnits) {
		const elevationMultiplier = this.config.units === "imperial" ? 3.28084 : 1;
		const elevationUnits = this.config.units === "imperial" ? " ft" : " m";
		return this.formatNumber(value, elevationMultiplier, digits, showUnits ? elevationUnits : null);
	},
	// formatNumber
	formatNumber: function (value, multipler, digits, units) {
		if (!isNaN(value)) {
			// Convert value
			value = value * multipler;
			// Round value
			value = this.roundValue(value, digits);
			// Format number
			value = new Number(value).toLocaleString(this.config.locale);
			// Append units
			if (units) {
				value += units;
			}
		}
		return value;
	},
	// getRadialLabelTransform
	getRadialLabelTransform(index, count) {
		const degrees = 360 / count / 2 + index * (360 / count);
		const rotation = (index < count / 2 ? -90 : 90) + degrees;
		const labelRadius = 96;
		const translation = this.polarToCartesian(0, 0, labelRadius, degrees);
		return `translate(${translation.x}, ${translation.y}) rotate(${rotation})`;
	},
	// getRadialDataPath
	getRadialDataPath(index, count, value) {
		const gap = 5;
		const startAngle = gap / 2 + index * (360 / count);
		const endAngle = startAngle + (360 - count * gap) / count;
		const radius = { inner: 109, outer: 109 + value * 100 };
		if (value > 0) {
			// identify points
			var p1 = this.polarToCartesian(0, 0, radius.inner, startAngle);
			var p2 = this.polarToCartesian(0, 0, radius.outer - 10, startAngle);
			var p3 = this.polarToCartesian(0, 0, radius.outer, startAngle + 5 / 2);
			var p4 = this.polarToCartesian(0, 0, radius.outer, endAngle - 5 / 2);
			var p5 = this.polarToCartesian(0, 0, radius.outer - 10, endAngle);
			var p6 = this.polarToCartesian(0, 0, radius.inner, endAngle);
			// describe path
			var d = [
				"M",
				p1.x,
				p1.y,
				"L",
				p2.x,
				p2.y,
				"A",
				10,
				10,
				0,
				0,
				1,
				p3.x,
				p3.y,
				"A",
				radius.outer,
				radius.outer,
				0,
				0,
				1,
				p4.x,
				p4.y,
				"A",
				10,
				10,
				0,
				0,
				1,
				p5.x,
				p5.y,
				"L",
				p6.x,
				p6.y,
				"A",
				radius.inner,
				radius.inner,
				0,
				0,
				0,
				p1.x,
				p1.y,
				"L",
				p1.x,
				p1.y
			].join(" ");
			return d;
		} else {
			return "";
		}
	},
	/**
	 * @function polarToCartesian
	 * @description Calculates the coordinates of a point on the circumference of a circle.
	 * @param  {integer} centerX          x
	 * @param  {integer} centerY          y
	 * @param  {integer} radius           radius of the circle
	 * @param  {integer} angleInDegrees   angle to the new point in degrees
	 * @see https://stackoverflow.com/questions/5736398/how-to-calculate-the-svg-path-for-an-arc-of-a-circle
	 */
	polarToCartesian: function (centerX, centerY, radius, angleInDegrees) {
		var angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
		return {
			x: centerX + radius * Math.cos(angleInRadians),
			y: centerY + radius * Math.sin(angleInRadians)
		};
	},
	/**
	 * @function roundValue
	 * @description rounds the value to number of digits.
	 * @param  {decimal} value            the value to be rounded
	 * @param  {integer} digits           the number of digits to round the value to
	 */
	roundValue: function (value, digits) {
		var rounder = Math.pow(10, digits);
		return (Math.round(value * rounder) / rounder).toFixed(digits);
	}
});

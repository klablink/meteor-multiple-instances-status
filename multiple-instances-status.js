var events = new (Npm.require('events').EventEmitter)(),
	collectionName = process.env.MULTIPLE_INSTANCES_COLLECTION_NAME || 'instances',
	defaultPingInterval = (process.env.MULTIPLE_INSTANCES_PING_INTERVAL || 10) * 1000; // default to 10s

var Intances = new Meteor.Collection(collectionName);

var InstancesRaw = Intances.rawCollection();
var indexExpire = Math.ceil(defaultPingInterval * 3 / 60000) * 60000;

// ensures at least 3 ticks before expiring
InstancesRaw.indexes()
	.then(function(result) {
		return result.some(function(index) {
			if (index.key && index.key['_updatedAt'] === 1) {
				if (index.expireAfterSeconds !== indexExpire) {
					InstancesRaw.dropIndex(index.name);
					return false;
				}
				return true;
			}
		})
	})
	.then(function(created) {
		if (!created) {
			InstancesRaw.createIndex({_updatedAt: 1}, {expireAfterSeconds: indexExpire});
		}
	});

InstanceStatus = {
	name: undefined,
	extraInformation: undefined,

	events: events,

	getCollection: function() {
		return Intances;
	},

	registerInstance: function(name, extraInformation) {
		InstanceStatus.name = name;
		InstanceStatus.extraInformation = extraInformation;

		if (InstanceStatus.id() === undefined || InstanceStatus.id() === null) {
			return console.error('[multiple-instances-status] only can be called after Meteor.startup');
		}

		var now = new Date(),
			instance = {
				$set: {
					pid: process.pid,
					name: name
				},
				$currentDate: {
					_createdAt: true,
					_updatedAt: true
				}
			};

		if (extraInformation) {
			instance.$set.extraInformation = extraInformation;
		}

		try {
			Intances.upsert({_id: InstanceStatus.id()}, instance);
			var result = Intances.findOne({_id: InstanceStatus.id()});
			InstanceStatus.start();

			events.emit('registerInstance', result, instance);

			process.on('exit', InstanceStatus.onExit);

			return result;
		} catch (e) {
			return e;
		}
	},

	unregisterInstance: function() {
		try {
			var result = Intances.remove({_id: InstanceStatus.id()});
			InstanceStatus.stop();

			events.emit('unregisterInstance', InstanceStatus.id());

			process.removeListener('exit', InstanceStatus.onExit);

			return result;
		} catch (e) {
			return e;
		}
	},

	start: function(interval) {
		InstanceStatus.stop();

		interval = interval || defaultPingInterval;

		InstanceStatus.interval = Meteor.setInterval(function() {
			InstanceStatus.ping();
		}, interval);
	},

	stop: function(interval) {
		if (InstanceStatus.interval) {
			InstanceStatus.interval.close();
			delete InstanceStatus.interval;
		}
	},

	ping: function() {
		var count = Intances.update(
			{
				_id: InstanceStatus.id()
			},
			{
				$currentDate: {
					_updatedAt: true
				}
			});

		if (count === 0) {
			InstanceStatus.registerInstance(InstanceStatus.name, InstanceStatus.extraInformation);
		}
	},

	onExit: function() {
		InstanceStatus.unregisterInstance();
	},

	activeLogs: function() {
		Intances.find().observe({
			added: function(record) {
				var log = '[multiple-instances-status] Server connected: ' + record.name + ' - ' + record._id;
				if (record._id == InstanceStatus.id()) {
					log += ' (me)';
				}
				console.log(log.green);
			},
			removed: function(record) {
				var log = '[multiple-instances-status] Server disconnected: ' + record.name + ' - ' + record._id;
				console.log(log.red);
			}
		});
	},

	id: function() {}
};

Meteor.startup(function() {
	var ID = Random.id();

	InstanceStatus.id = function() {
		return ID;
	};
});

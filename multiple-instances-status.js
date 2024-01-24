import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { Random } from 'meteor/random';

// eslint-disable-next-line no-undef
const events = new (Npm.require('events').EventEmitter)();
const collectionName = process.env.MULTIPLE_INSTANCES_COLLECTION_NAME || 'instances';
const defaultPingInterval = (process.env.MULTIPLE_INSTANCES_PING_INTERVAL || 10); // default to 10s

const Instances = new Mongo.Collection(collectionName);

const InstancesRaw = Instances.rawCollection();

// if not set via env var ensures at least 3 ticks before expiring (multiple of 60s)
const indexExpire = parseInt(process.env.MULTIPLE_INSTANCES_EXPIRE || (Math.ceil(defaultPingInterval * 3 / 60) * 60), 10);

InstancesRaw.indexes()
    .catch(function () {
        // the collection should not exist yet, return empty then
        return [];
    })
    .then(function (result) {
        return result.some(function (index) {
            if (index.key && index.key._updatedAt === 1) {
                if (index.expireAfterSeconds !== indexExpire) {
                    InstancesRaw.dropIndex(index.name)
                        .then();
                    return false;
                }
                return true;
            }
            return false;
        });
    })
    .then(function (created) {
        if (!created) {
            InstancesRaw.createIndex({ _updatedAt: 1 }, { expireAfterSeconds: indexExpire })
                .catch(function (err) {
                    console.error('[multiple-instances-status] Error creating index:', err);
                });
        }
    });

// eslint-disable-next-line no-global-assign
InstanceStatus = {
    name: undefined,
    extraInformation: undefined,

    events,

    getCollection() {
        return Instances;
    },

    async registerInstance(name, extraInformation) {
        InstanceStatus.name = name;
        InstanceStatus.extraInformation = extraInformation;

        if (InstanceStatus.id() === undefined || InstanceStatus.id() === null) {
            return console.error('[multiple-instances-status] only can be called after Meteor.startup');
        }

        const instance = {
            $set: {
                pid: process.pid,
                name,
            },
            $currentDate: {
                _createdAt: true,
                _updatedAt: true,
            },
        };

        if (extraInformation) {
            instance.$set.extraInformation = extraInformation;
        }

        try {
            // noinspection JSUnresolvedFunction
            await Instances.upsertAsync({ _id: InstanceStatus.id() }, instance);
            // noinspection JSUnresolvedFunction
            const result = await Instances.findOneAsync({ _id: InstanceStatus.id() });

            InstanceStatus.start();

            events.emit('registerInstance', result, instance);

            process.on('beforeExit', InstanceStatus.onExit);

            return result;
        } catch (e) {
            return e;
        }
    },

    async unregisterInstance() {
        try {
            const result = await Instances.removeAsync({ _id: InstanceStatus.id() });
            InstanceStatus.stop();

            events.emit('unregisterInstance', InstanceStatus.id());

            process.removeListener('beforeExit', InstanceStatus.onExit);

            return result;
        } catch (e) {
            return e;
        }
    },

    start(interval) {
        InstanceStatus.stop();

        interval = interval || defaultPingInterval;

        InstanceStatus.interval = Meteor.setInterval(async function () {
            await InstanceStatus.ping();
        }, interval * 1000);
    },

    stop() {
        if (InstanceStatus.interval) {
            InstanceStatus.interval.close();
            delete InstanceStatus.interval;
        }
    },

    async ping() {
        const count = await Instances.updateAsync(
            {
                _id: InstanceStatus.id(),
            },
            {
                $currentDate: {
                    _updatedAt: true,
                },
            });

        if (count === 0) {
            await InstanceStatus.registerInstance(InstanceStatus.name, InstanceStatus.extraInformation);
        }
    },

    async onExit() {
        await InstanceStatus.unregisterInstance();
    },

    activeLogs() {
        Instances.find()
            .observe({
                added(record) {
                    let log = `[multiple-instances-status] Server connected: ${record.name} - ${record._id}`;
                    if (record._id == InstanceStatus.id()) {
                        log += ' (me)';
                    }
                    // eslint-disable-next-line no-console
                    console.log(log);
                },
                removed(record) {
                    const log = `[multiple-instances-status] Server disconnected: ${record.name} - ${record._id}`;
                    // eslint-disable-next-line no-console
                    console.log(log);
                },
            });
    },

    id() {
    },
};

Meteor.startup(function () {
    const ID = Random.id();

    InstanceStatus.id = function () {
        return ID;
    };
});

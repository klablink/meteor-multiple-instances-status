Package.describe({
  name: 'konecty:multiple-instances-status',
  summary: 'Keep a collection with active servers/instances',
  version: '1.2.0',
  git: 'https://github.com/Konecty/meteor-multiple-instances-status'
});

Package.onUse(function(api) {
  api.versionsFrom('2.13.3');

  api.use('random');
  api.use(['ecmascript', 'modules']);

  api.addFiles('multiple-instances-status.js', ['server']);

  api.export(['InstanceStatus'], ['server']);
});

Package.onTest(function(api) {

});

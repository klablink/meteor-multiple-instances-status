Package.describe({
  name: 'konecty:multiple-instances-status',
  summary: 'Keep a collection with active servers/instances',
  version: '1.2.0',
  git: 'https://github.com/Konecty/meteor-multiple-instances-status',
});

Package.onUse(function(api) {
  api.versionsFrom(['2.13.3', '3.0','3.3.2','3.4']);

  api.use('random');
  api.use(['ecmascript', 'modules', 'mongo']);

  api.addFiles('multiple-instances-status.js', ['server']);

  api.export(['InstanceStatus'], ['server']);
});

Package.onTest(function(api) {

});

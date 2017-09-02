/**
 * Created by dell on 2017/5/14.
 */
let md5 = require('./md5.js');
let user = process.env.ADMIN_USER;
let pass = md5(process.env.ADMIN_PASS);
let avatar = 'avatar.jpg';
let intro ='Never too old to learn';
let nickname = 'Open blog by vue';

mongoURL = process.env.OPENSHIFT_MONGODB_DB_URL || process.env.MONGO_URL,
mongoURLLabel = "";

if (mongoURL == null && process.env.DATABASE_SERVICE_NAME) {
    var mongoServiceName = process.env.DATABASE_SERVICE_NAME.toUpperCase(),
        mongoHost = process.env[mongoServiceName + '_SERVICE_HOST'],
        mongoPort = process.env[mongoServiceName + '_SERVICE_PORT'],
        mongoDatabase = process.env[mongoServiceName + '_DATABASE'],
        mongoPassword = process.env[mongoServiceName + '_PASSWORD']
        mongoUser = process.env[mongoServiceName + '_USER'];

    if (mongoHost && mongoPort && mongoDatabase) {
        mongoURLLabel = mongoURL = 'mongodb://';
        if (mongoUser && mongoPassword) {
        mongoURL += mongoUser + ':' + mongoPassword + '@';
        }
        // Provide UI label that excludes user id and pw
        mongoURLLabel += mongoHost + ':' + mongoPort + '/' + mongoDatabase;
        mongoURL += mongoHost + ':' +  mongoPort + '/' + mongoDatabase;

    }
} else if (mongoURL == null) {
    mongoURL = 'mongodb://localhost:27017/vueblog'
}

module.exports = {
    dbUrl:mongoURL,
    user:user,
    pass:pass,
    avatar:avatar,
    intro:intro,
    nickname:nickname
}
#!/bin/env node
//  OpenShift sample Node application
var express = require('express');
var fs      = require('fs');
var mongodb = require('mongodb');
var path = require ('path');
var exphbs  = require('express-handlebars');
var request = require('request');


var App = function() {

    // Scope
    var self = this;
    // Webapp setup
    self.app = express();


    // Setup
    self.dbServer = new mongodb.Server(process.env.OPENSHIFT_MONGODB_DB_HOST, parseInt(process.env.OPENSHIFT_MONGODB_DB_PORT));
    self.db = new mongodb.Db(process.env.OPENSHIFT_APP_NAME, self.dbServer, {auto_reconnect: true});
    self.dbUser = process.env.OPENSHIFT_MONGODB_DB_USERNAME;
    self.dbPass = process.env.OPENSHIFT_MONGODB_DB_PASSWORD;

    self.ipaddr  = process.env.OPENSHIFT_NODEJS_IP;
    self.port    = parseInt(process.env.OPENSHIFT_NODEJS_PORT) || 8080;

    if (typeof self.ipaddr === "undefined") {
        console.warn('No OPENSHIFT_NODEJS_IP environment variable');
    };

    // Route functions
    self.routes = {};
    // NOTE: removed next parameter
    self.routes['test'] = function(req, res){ 
        res.send('test ok');
    };

    self.routes['renderer'] = function(req, res){ 
        res.sendfile('./public/render/index-pt-1.html', {root: __dirname });
        res.sendfile('./public/render/index-middle.html', {root: __dirname });
        res.sendfile('./public/render/index-pt-2.html', {root: __dirname });
    };

    // mustache setup
    self.app.engine('handlebars', exphbs({defaultLayout: 'main'}));
    self.app.set('view engine', 'handlebars');

    self.app.use(express.static(__dirname + '/public'));
    //self.app.use(express.static(path.join(__dirname + '.../public')));

    // Connect routing
    self.app.get('/test', self.routes['test']);
    //self.app.get('/renderer', self.routes['renderer']);

    //curl -i https://api.github.com/repos/digithree/constitution-of-ireland-render/commits

    self.app.get('/renderer', function(req, res) {
        self.db.collection('repo').find().toArray(function(err, items) {
            if (err) {
                console.error(err);
                //res.end(JSON.stringify({error : "Some error"}));
                res.render('beard',
                    JSON.stringify({
                        direction: "",
                        sha: "ERROR"
                    })
                );
            } else {
                //res.end(JSON.stringify(names));
                console.log("Got all items from repo collection");
                res.render('beard', JSON.stringify([{
                        direction: "",
                        sha: "ERROR"
                    }]));
                //JSON.stringify(items)
            }
        });
        /*
        request(url, function(err, resp, body) {
            //var jsonObj = JSON.parse(body);
            console.log(body);
            res.render('beard', body);
        });
        */
    });

    /*
    res.render('beard', {
                message: "Hello World!",
                items: [
                    {
                        title: "Part One",
                        direction: "",
                        category: "court",
                        subheading: "The year",
                        content: "A few words about stuff"
                    },
                    {
                        title: "Part Two",
                        direction: "class=timeline-inverted",
                        category: "nation",
                        subheading: "The other year",
                        content: "Some more stuff about stuff"
                    }
                ]
            });
    */

    //timeline: "{{#items}}<li {{.title}}><div class=\"timeline-image\"><img class=\"img-circle img-responsive\" src=\"img/categories/{{.category}}.png\" alt=\"\"></div><div class=\"timeline-panel\"><div class=\"timeline-heading\"><h4>{{.title}}</h4><h4 class=\"subheading\">{{.subheading}}</h4></div><div class=\"timeline-body\"><p class=\"text-muted\">{{.content}}</p></div></div></li>{{/items}}"

    /*
    self.app.get("/renderer", function(req, res) {
        res.render("./public/render/beard.html", {
            locals: {
                message: "Hello World!",
                items: [
                    {
                        title: "Part One",
                        direction: "",
                        category: "court.png",
                        subheading: "The year",
                        content: "A few words about stuff"
                    },
                    {
                        title: "Part Two",
                        direction: "class=\"timeline-inverted\"",
                        category: "nation.png",
                        subheading: "The other year",
                        content: "Some more stuff about stuff"
                    }
                ]
            },
            partials: {
                timeline: "{{#items}}<li {{.title}}><div class=\"timeline-image\"><img class=\"img-circle img-responsive\" src=\"img/categories/{{.category}}.png\" alt=\"\"></div><div class=\"timeline-panel\"><div class=\"timeline-heading\"><h4>{{.title}}</h4><h4 class=\"subheading\">{{.subheading}}</h4></div><div class=\"timeline-body\"><p class=\"text-muted\">{{.content}}</p></div></div></li>"
            }
        });
    });
    */

    //"<ul>{{#items}}<li>{{.}}</li>{{/items}}</ul>"

    self.app.get('/drop-db', function(req, res){
        self.db.collection('repo', function(err, repo) {
            if (err) {
                console.error(err);
                res.end("Error");
                return;
            } else {
                repo.drop();
                console.log("DB 'repo' dropped");
                res.end("Dropped db");
            }
        })
    });

    // Generate db from GitHub API
    // TODO : make as CRON job every day?
    self.app.get('/create-db', function(req, res){
        self.db.collection('repo', function(err, repo) {
            if (err) {
                console.error(err);
                res.end("Error");
                return;
            }

            require( 'https' )
                .get({
                    hostname: 'api.github.com',
                    path: '/repos/digithree/fake/commits',
                    headers: {
                        'User-Agent' : 'digithree'
                    }
                }, function(rezzz) {
                    rezzz.on('data', function(data) {
                        console.log(data+'');
                        repo.insert(data, {safe : false}, function(err, inserted_doc) {
                            if( err && err.name == "MongoError" && err.code == 11000 ) {
                                console.log("This entry already exists.");
                                res.end("This entry already exists.");
                                return;
                            } else if( err ) {
                                console.log("Some unknown error.");
                                res.end("Some error");
                                return;
                            }
                            res.end("Created db from JSON array!");
                        });
                    });
                });
        });
    });

    // Logic to open a database connection. We are going to call this outside of app so it is available to all our functions inside.
    self.connectDb = function(callback){
        self.db.open(function(err, db){
            if(err){ throw err };
            self.db.authenticate(self.dbUser, self.dbPass, {authdb: "admin"},  function(err, res){
                if(err){ throw err };
                callback();
            });
        });
    };

    //starting the nodejs server with express
    self.startServer = function(){
        self.app.listen(self.port, self.ipaddr, function(){
            console.log('%s: Node server started on %s:%d ...', Date(Date.now()), self.ipaddr, self.port);
        });
    }

    // Destructors
    self.terminator = function(sig) {
        if (typeof sig === "string") {
            console.log('%s: Received %s - terminating Node server ...', Date(Date.now()), sig);
            process.exit(1);
        };
        console.log('%s: Node server stopped.', Date(Date.now()) );
    };

    process.on('exit', function() { self.terminator(); });

    self.terminatorSetup = function(element, index, array) {
        process.on(element, function() { self.terminator(element); });
    };

    ['SIGHUP', 'SIGINT', 'SIGQUIT', 'SIGILL', 'SIGTRAP', 'SIGABRT', 'SIGBUS', 'SIGFPE', 'SIGUSR1', 'SIGSEGV', 'SIGUSR2', 'SIGPIPE', 'SIGTERM'].forEach(self.terminatorSetup);
};

//make a new express app
var app = new App();

//call the connectDb function and pass in the start server command
app.connectDb(app.startServer);
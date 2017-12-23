const express = require('express');
const exphbs = require('express-handlebars');
const app = express();
const path = require('path');
const bodyParser = require('body-parser');
const methodOverride = require('method-override');
const server = require('http').createServer(app);
const redis = require('redis');
const io = require('socket.io')(server);
const port = process.env.PORT || 3000;
const client = redis.createClient();
const ejs = require('ejs');

client.on('connect', function () {
    console.log('Connected to Redis!');
});
server.listen(port, function () {
    console.log('Server listening at port %d', port);
});

// Routing
app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json({extended: true}));
app.use(express.static(__dirname + '/views'));
app.set('view engine', 'jade');

// GET
app.route('/').get(function (req, res) {
    res.render('index.ejs', {menu: '1', content: '2'})
});
// app.route('/account').get(function (req, res) {
//     res.render('account.ejs', {error: ''});
// });
app.route('/register').get(function (req, res) {
    res.render('register.ejs');
});

// POST
app.route('/account').post(function (req, res) {
    let id = req.body.id;
    client.hgetall(id, function (err, obj) {
        if (!obj) {
            res.render('account.ejs', {error: '<p>User does not exist</p>'});
        } else {
            obj.id = id;
            res.render('details.ejs', {
                user: obj
            });
        }
    });
});

app.route('/register').post(function (req, res) {
    let id = req.body.id;
    let password = req.body.password;
    let first_name = req.body.first_name;
    let last_name = req.body.last_name;
    let email = req.body.email;
    let phone = req.body.phone;
    client.hmset(id, [
        'first_name', first_name,
        'password', password,
        'last_name', last_name,
        'email', email,
        'phone', phone
    ], function (err, reply) {
        if (err) {
            console.log(err);
        }
        console.log(reply);
        res.redirect('/');
    });
});
app.route('/delete/:id').post(function (req, res) {
    client.del(req.params.id);
    res.redirect('/');
});

let numUsers = 0;
io.on('connection', function (socket) {
    let addedUser = false;
    // when the client emits 'new message', this listens and executes
    socket.on('new message', function (data) {
        // we tell the client to execute 'new message'
        socket.broadcast.emit('new message', {
            username: socket.username,
            message: data
        });
    });
    socket.on('register user', function (username, password, fn) {
        if (addedUser) return;
        let id = username;

        checkUser(validUser);

        function checkUser(callback) {
            client.hgetall(id, function (err, obj) {
                if (obj) {
                    if (password == obj.password) {
                        obj.id = id;
                        callback(obj);
                    } else {
                        callback('valid');
                    }
                } else {
                    callback('error');
                }
            });

        }

        function validUser(result) {
            fn(result);
            if (result != 'error' && result != 'valid') {
                socket.username = result.id;
                ++numUsers;
                addedUser = true;
                socket.emit('login', {
                    numUsers: numUsers
                });
                // echo globally (all clients) that a person has connected
                socket.broadcast.emit('user joined', {
                    username: socket.username,
                    numUsers: numUsers
                });
            }
        }
    });
    // when the client emits 'typing', we broadcast it to others
    socket.on('typing', function () {
        socket.broadcast.emit('typing', {
            username: socket.username
        });
    });
    // when the client emits 'stop typing', we broadcast it to others
    socket.on('stop typing', function () {
        socket.broadcast.emit('stop typing', {
            username: socket.username
        });
    });
    // when the user disconnects.. perform this
    socket.on('disconnect', function () {
        if (addedUser) {
            --numUsers;
            // echo globally that this client has left
            socket.broadcast.emit('user left', {
                username: socket.username,
                numUsers: numUsers
            });
        }
    });
});

var express = require("express"),
  app = express(),
  bodyParser = require('body-parser'),
  errorHandler = require('errorhandler'),
  methodOverride = require('method-override'),
  hostname = process.env.HOSTNAME || 'localhost',
  port = parseInt(process.env.PORT, 10) || 1337;

app.get("/", function (req, res) {
  res.redirect("/index.html");
});

app.use(methodOverride());

app.use(bodyParser.json());

app.use(bodyParser.urlencoded({
  extended: true
}));

app.use(express.static(__dirname + '/public'));

app.use(errorHandler({
  dumpExceptions: true,
  showStack: true
}));


app.listen(port, hostname);
console.log("Server is listening at http://" + hostname + ":" + port);
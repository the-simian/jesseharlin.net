
(function () {
    var lastTime = 0;
    var vendors = ['ms', 'moz', 'webkit', 'o'];
    for (var x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
        window.requestAnimationFrame = window[vendors[x] + 'RequestAnimationFrame'];
        window.cancelRequestAnimationFrame = window[vendors[x] +
            'CancelRequestAnimationFrame'];
    }

    if (!window.requestAnimationFrame)
        window.requestAnimationFrame = function (callback, element) {
            var currTime = new Date().getTime();
            var timeToCall = Math.max(0, 16 - (currTime - lastTime));
            var id = window.setTimeout(function () {
                    callback(currTime + timeToCall);
                },
                timeToCall);
            lastTime = currTime + timeToCall;
            return id;
        };

    if (!window.cancelAnimationFrame)
        window.cancelAnimationFrame = function (id) {
            clearTimeout(id);
        };
}());


$(document).ready(function () {



    var $world = $('#world');
    var $viewPort = $('#viewport');
    var $window = $(window);

    var worldXAngle = 0;
    var worldYAngle = 0;
    var distanceFromCamera = 10;


    var numberOfObjects = 20;

    var numberOfSublayers = 3;

    var objectLayers = [];
    //**-------------


    function generateWorldObjects() {
        var objects = [];


        $world.html('');

        for (var i = 0; i < numberOfObjects; i++) {
            objects.push(createWorldObject());
        }

        $.each(objects, function (index, el) {
            $world.append($(el));
        });

    }


    function randomNumber(min, max) {


        return (Math.random() * (max - min)) + min;
    }

    function createWorldObject() {
        var layers = [];

        var cubeSize = randomNumber(1, 2);

        var translate = {
            'transform': 'translateZ(' + randomNumber(-256, 256) + 'px) translateX(' + randomNumber(-256, 256) + 'px) translateY(' + randomNumber(-256, 256) + 'px)',
            'left': randomNumber(10, 90) - (cubeSize * 0.5) + '%',
            'top': randomNumber(10, 90) - (cubeSize * 0.5) + '%',
            'height': cubeSize + '%',
            'width': cubeSize + '%'
        };


        var wAndH = randomNumber(25, 300);
        var subtractor = randomNumber(1, 10) * numberOfSublayers;

        var subs = Math.ceil(randomNumber(0, numberOfSublayers));

        for (var i = 0; i < subs; i++) {


            wAndH = wAndH - subtractor;



            var transData = {
                x: randomNumber(-30, 30),
                y: randomNumber(-30, 30),
                z: randomNumber(-30, 30),
                rotZ: randomNumber(1, 90),
                scale: randomNumber(0.3, 1),
                speed: Math.random() * 0.7
            };



            var translate2 = {

                'width': wAndH,
                'height': wAndH,


            };


            var $layerObj = $('<div class="world-object-layer"></div>')
                .css(translate2)
                .css({
                    'transform': 'translateX(' + transData.x + 'px) ' +
                        'translateY(' + transData.y + 'px) ' +
                        'translateZ(' + transData.z + 'px) ' +
                        'rotateZ(' + transData.rotZ + 'deg)' +
                        'scale(' + transData.scale + ')'
                })
                .data('transform', transData);

            layers.push($layerObj);
        }

        var $obj = $('<div class="world-object"></div>').css(translate);

        $.each(layers, function (index, ele) {
            $obj.append($(ele));

        });


        return $obj;
    }


    //**--------------

    var updateView = function () {
        $world.css({
            'transform': 'translateZ(' + distanceFromCamera + 'px) rotateX(' + worldXAngle + 'deg) rotateY(' + worldYAngle + 'deg)'
        });


    };
    var counter = 0;
    var $objectLayers;

    function update() {

        $objectLayers = $objectLayers || $('.world-object-layer');

        $.each($objectLayers, function (index, element) {
            var $thisLayer = $(element);

            var oldData = $thisLayer.data('transform');

            var newData = {
                x: oldData.x,
                y: oldData.y,
                z: oldData.z,
                rotY: -worldYAngle,
                rotX: -worldXAngle,
                rotZ: oldData.rotZ + oldData.speed,
                scale: oldData.scale,
                opacity: 1,
                speed: oldData.speed
            };




            $thisLayer.css({
                'transform': 'translateX( ' + newData.x + 'px ) ' +
                    'translateY( ' + newData.y + 'px ) ' +
                    'translateZ( ' + newData.z + 'px ) ' +
                    'rotateY( ' + newData.rotY + 'deg ) ' +
                    'rotateX( ' + newData.rotX + 'deg ) ' +
                    'rotateZ( ' + newData.rotZ + 'deg ) ' +
                    'scale( ' + newData.scale + ' )',

                'opacity': newData.opacity

            }).data('transform', newData);

            counter++;
        });

        requestAnimationFrame(update);
    }


    var handleMousemove = function (e) {
        worldYAngle = Math.floor(-(0.5 - (e.clientX / window.innerWidth)) * 180);
        worldXAngle = Math.floor((0.5 - (e.clientY / window.innerHeight)) * 180);
        updateView();
    };

    generateWorldObjects();

    $objectLayers = $('.world-object-layer');

    update();
    $window.on('mousemove', handleMousemove);


});
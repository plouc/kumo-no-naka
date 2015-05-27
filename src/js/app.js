var request = require('superagent');
var d3      = require('d3/d3');
var _       = require('lodash');
var icons   = require('./icons');
var Anchor  = require('./Anchor');

var schema  = d3.select('#schema').append('svg')
    .attr('width',  3000)
    .attr('height', 3000)
.append('g')
    .attr('transform', 'translate(30, 120)')
;
var tags    = d3.select('#tags');

function loadData(cb) {
    request.get('aws.json').end((err, res) => {
        if (err) throw err;
        cb(res.body);
    });
}

var layout = {
    vpc:         { spacing: 60, b: { t: 120, r: 30, b: 20, l: 30 } },
    autoscaling: { size: 80, spacing: 10 },
    subnet:      { spacing: 24, b: { t: 35,  r: 15, b: 10, l: 15 } },
    instance:    { size: 120, spacing: 10 }
};

var instancePadding   = 8;
var instanceStateSize = 8;
var volumeSize        = 32;
var volumeSpacing     = 6;


function drawSchema(vpcs, peerings) {

    var vpcX = 0;
    vpcs.forEach(vpc => {
        vpc.subnets       = vpc.subnets.filter(d => d.instances.length > 0);
        vpc.maxInstances  = 0;
        var maxInstSubnet = _.max(vpc.subnets, subnet => subnet.instances.length);
        if (_.isObject(maxInstSubnet)) {
            vpc.maxInstances  = maxInstSubnet.instances.length;
        }

        // pre-compute layout
        vpc.layout = {};
        vpc.layout.width = vpc.maxInstances * layout.instance.size +
                          (vpc.maxInstances - 1) * layout.instance.spacing +
                          layout.vpc.b.l + layout.vpc.b.r +
                          layout.subnet.b.l + layout.subnet.b.r;
        vpc.layout.height = vpc.subnets.length * layout.instance.size +
                            vpc.subnets.length * (layout.subnet.b.t + layout.subnet.b.b + layout.subnet.spacing) - layout.subnet.spacing +
                            layout.vpc.b.t + layout.vpc.b.b;
        vpc.layout.x = vpcX;
        vpcX += vpc.layout.width + layout.vpc.spacing;

        var instances = [];

        vpc.subnets.forEach((subnet, i) => {
            subnet.layout = {
                x: layout.vpc.b.l,
                y: i * (layout.instance.size + layout.subnet.b.t + layout.subnet.b.b) + i * layout.subnet.spacing + layout.vpc.b.t,
                width:  vpc.maxInstances * layout.instance.size +
                       (vpc.maxInstances - 1) * layout.instance.spacing +
                        layout.subnet.b.l + layout.subnet.b.r,
                height: layout.instance.size + layout.subnet.b.t + layout.subnet.b.b
            };

            subnet.instances.forEach((instance, i) => {
                instance.layout = {
                    x: subnet.layout.x +
                       i * layout.instance.size +
                       i * layout.instance.spacing + layout.subnet.b.l,
                    y: subnet.layout.y + layout.subnet.b.t,
                    width:  layout.instance.size,
                    height: layout.instance.size
                };

                instances.push(instance);
            });
        });

        vpc.autoscalings.forEach((autoscaling, i) => {
            autoscaling.layout = {
                x: i * (layout.autoscaling.size + layout.autoscaling.spacing) - layout.autoscaling.spacing + 60,
                y: 60
            };
            autoscaling.layout.anchor = new Anchor({
                x: autoscaling.layout.x,
                y: autoscaling.layout.y + 30
            }, {
                distribute: 'horizontal',
                spacing:    10
            });

            autoscaling.paths = [];
            autoscaling.instances.forEach(instanceInfo => {
                if (_.find(instances, { id: instanceInfo.id })) {
                    autoscaling.layout.anchor.add();
                }
            });
            autoscaling.instances.forEach(instanceInfo => {
                var instance = _.find(instances, { id: instanceInfo.id });
                if (instance) {
                    var start = autoscaling.layout.anchor.get();
                    autoscaling.paths.push([
                        start,
                        { x: start.x, y: start.y + 15 },
                        { x: instance.layout.x + instance.layout.width / 2,    y: instance.layout.y - 20   },
                        { x: instance.layout.x + instance.layout.width / 2,    y: instance.layout.y    }
                    ]);
                    autoscaling.layout.anchor.next();
                }
            });
        });

        vpc.peerings = {
            requests: [],
            accepts:  []
        };

        vpc.layout.peerAnchorReq = new Anchor({
            x: vpc.layout.x + vpc.layout.width / 2,
            y: 0
        }, {
            distribute: 'horizontal'
        });
        vpc.layout.peerAnchorAcc = new Anchor({
            x: vpc.layout.x,
            y: 100
        }, {
            distribute: 'vertical'
        });
    });

    peerings.forEach(peering => {
        var requester = _.find(vpcs, { id: peering.requesterVpcInfo.id });
        var accepter  = _.find(vpcs, { id: peering.accepterVpcInfo.id  });

        if (requester && accepter) {
            requester.peerings.requests.push(peering);
            requester.layout.peerAnchorReq.add();

            accepter.peerings.accepts.push(peering);
            accepter.layout.peerAnchorAcc.add();
        }
    });


    var vpcsNodes = schema.selectAll('.vpc').data(vpcs);
    vpcsNodes.enter().append('g')
        .attr('class', 'vpc')
        .attr('transform', d => `translate(${ d.layout.x }, 0)`)
        .each(function (d) {
            var vpc = d3.select(this);

            vpc.append('rect')
                .attr('class', 'vpc__wrapper')
                .attr('width', d.layout.width)
                .attr('height', d.layout.height)
                .attr({ rx: 5, ry: 5 })
            ;

            var vpcIcon = vpc.append('g').attr('transform', 'translate(55, 0)');
            icons.vpc(vpcIcon);
            vpcIcon.append('text')
                .attr('class', 'vpc__label__text')
                .attr('text-anchor', 'middle')
                .attr('y', -46)
                .text(d.tags.name ? d.tags.name : d.id)
            ;

            if (d.internetGateway !== null) {
                var igwGroup = vpc.append('g')
                    .attr('transform', `translate(${ d.layout.width - 30 - layout.vpc.b.r }, 0)`)
                ;
                icons.igw(igwGroup);
                igwGroup.append('text')
                    .attr('class', 'igw__label__text')
                    .text(d.internetGateway.tags.name ? d.internetGateway.tags.name : d.internetGateway.id)
                    .attr('text-anchor', 'middle')
                    .attr('y', -40)
                ;
            }
        })
    ;

    var peeringOffsetV = 80;
    peerings.forEach(peering => {
        var requester = _.find(vpcs, { id: peering.requesterVpcInfo.id });
        var accepter  = _.find(vpcs, { id: peering.accepterVpcInfo.id  });

        if (requester && accepter) {
            var start = requester.layout.peerAnchorReq.get();
            var end   = accepter.layout.peerAnchorAcc.get();

            var points = [
                start,
                { x: start.x,                        y: start.y -peeringOffsetV },
                { x: end.x - layout.vpc.spacing / 2, y: start.y -peeringOffsetV },
                { x: end.x - layout.vpc.spacing / 2, y: end.y },
                end
            ];

            requester.layout.peerAnchorReq.next();
            accepter.layout.peerAnchorAcc.next();

            peeringOffsetV += 15;

            var line = d3.svg.line()
                .x(d => d.x)
                .y(d => d.y)
                .interpolate('linear')
            ;

            var peeringEl = schema.append('g');
            peeringEl.append('path').datum(points)
                .attr('class', 'vpc-peering__path')
                .attr('d', line)
            ;

            icons.vpcPeering(peeringEl.append('g').attr('transform', `translate(${ points[0].x }, ${ points[0].y })`));
            icons.vpcPeering(peeringEl.append('g').attr('transform', `translate(${ points[4].x }, ${ points[4].y })`));
        }
    });


    var subnets = vpcsNodes.selectAll('.subnets').data(d => d.subnets);
    subnets.enter().append('g')
        .attr('class', 'subnet')
        .each(function (d) {
            var subnet = d3.select(this);

            subnet.append('rect')
                .attr('transform', d => `translate(${ d.layout.x }, ${ d.layout.y })`)
                .attr('class', 'subnet__wrapper')
                .attr('width',  d.layout.width)
                .attr('height', d.layout.height)
                .attr({ rx: 3, ry: 3 })
            ;

            subnet.append('rect')
                .attr('transform', d => `translate(${ d.layout.x }, ${ d.layout.y })`)
                .attr('class', 'vpc__label__background')
                .attr('width', 140)
                .attr('height', 28)
                .attr('x', layout.subnet.b.l)
                .attr('y', -14)
                .attr({ rx: 2, ry: 2 })
            ;

            subnet.append('text')
                .attr('transform', d => `translate(${ d.layout.x }, ${ d.layout.y })`)
                .attr('class', 'subnet__label__text')
                .attr('x', layout.subnet.b.l + 10)
                .attr('y', 4)
                .text(d.tags.name ? d.tags.name : d.id)
            ;
        })
    ;


    var autoscalings = vpcsNodes.selectAll('.autoscaling').data(d => d.autoscalings);
    autoscalings.enter().append('g')
        .attr('class', 'autoscaling')
        .each(function (d) {
            d.showLinks = false;
            var _this = d3.select(this);

            var line = d3.svg.line()
                .x(d => d.x)
                .y(d => d.y)
                .interpolate('step')
            ;

            d.paths.forEach(path => {
                _this.append('path').attr('class', 'as__instance__link').datum(path).attr('d', line);
            });
            _this.selectAll('.as__instance__link').style('display', 'none');

            var autoscaling = d3.select(this).append('g')
                .attr('transform', d => `translate(${ d.layout.x }, ${ d.layout.y })`)
            ;
            icons.autoscaling(autoscaling);

            autoscaling.on('click', function (d) {
                d.showLinks = !d.showLinks;
                _this.selectAll('.as__instance__link').style('display', d.showLinks ? 'block' : 'none');
            });
            autoscaling.on('mouseenter', function (d) {
                //console.log(d.name || d.id);
            });
        })
    ;


    var instances = subnets.selectAll('.instance').data(d => d.instances);
    instances.enter().append('g')
        .attr('transform', d => `translate(${ d.layout.x }, ${ d.layout.y })`)
        .attr('class', 'instance')
        .each(function (d) {
            var instance = d3.select(this);
            instance.append('rect')
                .attr('class', 'instance__wrapper')
                .attr('width',  d.layout.width)
                .attr('height', d.layout.height)
                .attr({ rx: 3, ry: 3 })
            ;

            instance.append('circle')
                .attr('class', `instance__state instance__state--${ d.state }`)
                .attr('r', instanceStateSize / 2)
                .attr('cx', 12)
                .attr('cy', 15)
            ;

            instance.append('text')
                .attr('class', 'instance__name')
                .attr('x', 24)
                .attr('y', 20)
                .text(d.tags.name ? d.tags.name : d.id)
            ;
        })
    ;

    var volumes = instances.selectAll('.volume').data(d => d.blockDeviceMappings);
    volumes.enter().append('g')
        .attr('class', 'volume')
        .attr('transform', (d, i) => {
            return `translate(${ i * volumeSize + i * volumeSpacing + instancePadding }, ${ layout.instance.size - volumeSize - instancePadding })`;
        })
        .each(function (d) {
            var volume = d3.select(this);
            volume.append('rect')
                .attr('class', 'volume__wrapper')
                .attr('width',  volumeSize)
                .attr('height', volumeSize)
                .attr({ rx: 2, ry: 2 })
            ;

            volume.append('text')
                .attr('class', 'volume__label__text')
                .attr('text-anchor', 'middle')
                .attr('x', volumeSize / 2)
                .attr('y', 17)
                .text(d.ebs.ebs.size)
            ;
        })
    ;
}

loadData((data) => {
    drawSchema(data.vpcs, data.vpcPeerings);
});



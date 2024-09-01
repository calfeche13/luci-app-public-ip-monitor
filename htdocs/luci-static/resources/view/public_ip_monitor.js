'use strict';
'require view';
'require form';
'require poll';

'require ui';
'require uci';
'require rpc';
'require tools.widgets as widgets';

/**
 * Shows/Hides element
 */
function toggleElement(show, query, node = document, originalDisplayStyle = 'block') {
  if (show) {
    node
      .querySelector(query)
      .style
      .display = originalDisplayStyle;
  } else {
    node
      .querySelector(query)
      .style
      .display = 'none';
  }
}

var monitorIpv4 = '0';
var monitorIpv6 = '0';
var ipv4ScriptContent = '';
var ipv6ScriptContent = '';

function processTabVisibility(data, node = document) {
  toggleElement(data.monitorIpv4 == '1', "li[data-tab='ipv4']", node);
  toggleElement(data.monitorIpv6 == '1', "li[data-tab='ipv6']", node);
  toggleElement(data.monitorIpv6 == '1' || data.monitorIpv4 == '1', "li[data-tab='history']", node);
}

function processPostRendering(data, node = document) {
  for (const e of node.querySelectorAll('div.cbi-map-tabbed div.cbi-section h3')) {
    e.parentNode.removeChild(e);
  }

  processTabVisibility(data, node);

  console.log(data);

  node
    .querySelector('div.cbi-section-node#cbi-public_ip_monitor-ipv4')
    .appendChild(E('p', {}, [
      E('h2', _('IPv4 Script')),
      E('p', { 'class': 'cbi-section-descr', 'style' : 'margin-bottom: 16px;' } , _('Script to run when the public IPv4 changes, use $1 to retrieve the new IPv4 inside the script.')),
      E('textarea', { 'id': 'ipv4_script', 'style': 'width:100%; margin-bottom: 16px;', 'rows': 25, 'resize': 'none' }, [ data.ipv4ScriptContent == undefined ? '' : data.ipv4ScriptContent ])
    ]));

  node
    .querySelector('div.cbi-section-node#cbi-public_ip_monitor-ipv6')
    .appendChild(E('p', {}, [
      E('h2', _('IPv6 Script')),
      E('p', { 'class': 'cbi-section-descr', 'style' : 'margin-bottom: 16px;' } , _('Script to run when the public IPv6 changes, use $1 to retrieve the new IPv6 inside the script.')),
      E('textarea', { 'id': 'ipv6_script', 'style': 'width:100%; margin-bottom: 16px;', 'rows': 25, 'resize': 'none' }, [ data.ipv6ScriptContent == undefined ? '' : data.ipv6ScriptContent ])
    ]));
}

/**
 * wrapper function to run tasks as promise and handle ui issues on post processesed ui,
 * running {@link processPostRendering} just before running Promise tasks
 * and then using then function to run again {@link processPostRendering}
 * to prevent reverting post processing of ui form.
 * 
 * @param {*} tasks 
 * @returns 
 */
function runTasks(tasks) {
  processPostRendering({ monitorIpv4, monitorIpv6, ipv4ScriptContent, ipv6ScriptContent });
  return Promise.all(tasks).then(() => {
    processPostRendering({ monitorIpv4, monitorIpv6, ipv4ScriptContent, ipv6ScriptContent });
  });
}

const load_ipv4_script_content = rpc.declare({
	object: 'luci.public_ip_monitor',
	method: 'get_ipv4_script_content'
});

const save_ipv4_script_content = rpc.declare({
	object: 'luci.public_ip_monitor',
	method: 'save_ipv4_script_content',
  params: ["content"]
});

const load_ipv6_script_content = rpc.declare({
	object: 'luci.public_ip_monitor',
	method: 'get_ipv6_script_content'
});

const save_ipv6_script_content = rpc.declare({
	object: 'luci.public_ip_monitor',
	method: 'save_ipv6_script_content',
  params: ["content"]
});

return view.extend({
  handleSave: function(ev) {
    var tasks = [];
    document.getElementById('maincontent').querySelectorAll('.cbi-map').forEach(function(map) {
        tasks.push(DOM.callClassMethod(map, 'save'));
    });

    let ipv4ScriptCurrentContent = (document.querySelector("textarea#ipv4_script").value || '').trim().replace(/\r\n/g, '\n') + '\n';
    if (ipv4ScriptCurrentContent != ipv4ScriptContent) {
      console.log("saving");
      tasks.push(save_ipv4_script_content(ipv4ScriptCurrentContent));
      // set global variable to prevent refreshing
      ipv4ScriptContent = ipv4ScriptCurrentContent;
    }

    let ipv6ScriptCurrentContent = (document.querySelector("textarea#ipv6_script").value || '').trim().replace(/\r\n/g, '\n') + '\n';
    if (ipv6ScriptCurrentContent != ipv6ScriptContent) {
      tasks.push(save_ipv6_script_content(ipv6ScriptCurrentContent));
      // set global variable to prevent refreshing
      ipv6ScriptContent = ipv6ScriptCurrentContent;
    }

    return runTasks(tasks);
  },
  handleSaveApply: function(ev, mode) {
      return this.handleSave(ev).then(() => {
          classes.ui.changes.apply(mode == '0');
      });
  },
  handleReset: function(ev) {
      var tasks = [];
      document.getElementById('maincontent').querySelectorAll('.cbi-map').forEach((map) => {
          tasks.push(DOM.callClassMethod(map, 'reset'));
      });

      return runTasks(tasks);
  },
  load: function() {
		return Promise.all([
      load_ipv4_script_content(),
      load_ipv6_script_content()
    ]);
	},
  render: function (data) {
    var m, s, o;

    ipv4ScriptContent = (data[0] || {'content' : ''}).content;
    ipv6ScriptContent = (data[1] || {'content' : ''}).content;

    window.m = data;

    m = new form.Map(
      'public_ip_monitor',
      _('Public IP Monitor'),
			_('This monitors changes on the internet-facing public IP and trigger tasks when a change occurs.')
    );
    m.tabbed = true;

    // Setting up General Tab
		s = m.section(form.TypedSection, 'general', _('General Settings'));
    s.anonymous = true;

		o = s.option(form.Flag, 'monitor_ipv4', _('Monitor IPv4'), _('Monitor if there your public ipv4 address.'));
    o.onchange = L.bind((a, b, c, newVal) => {
      monitorIpv4 = newVal;
      processTabVisibility({ monitorIpv4, monitorIpv6 });
    }, o, s);

    o = s.option(form.Value, 'ipv4_ip_service', _('IPv4 Service'), _('The service that we can retrieve the public IPv4.'));
    o.optional = false;
    o.datatype = 'hostname';
    o.retain = true;
    o.depends('monitor_ipv4', '1');

    o = s.option(form.Value, 'ipv4_check_interval', _('IPv4 Check Interval'), _('The interval in seconds which we will retrieve data from the service.'));
    o.optional = false;
    o.datatype = 'integer';
    o.retain = true;
    o.depends('monitor_ipv4', '1');

    o = s.option(form.Value, 'ipv4_script_location', _('IPv4 Script Location'), _('The location of the IPv4 on change script to be triggered, use $1 to get the new IPv4 as input.'));
    o.optional = false;
    o.datatype = 'string';
    o.retain = true;
    o.depends('monitor_ipv4', '1');

    o = s.option(form.Flag, 'monitor_ipv6', _('Monitor IPv6'), _('Monitor if there your public ipv6 address.'));
    o.onchange = L.bind((a, b, c, newVal) => {
      monitorIpv6 = newVal;
      processTabVisibility({ monitorIpv4, monitorIpv6 });
    }, o, s);

    o = s.option(form.Value, 'ipv6_ip_service', _('IPv6 Service'), _('The service that we can retrieve the public IPv6.'));
    o.optional = false;
    o.datatype = 'hostname';
    o.retain = true;
    o.depends('monitor_ipv6', '1');

    o = s.option(form.Value, 'ipv6_check_interval', _('IPv6 Check Interval'), _('The interval in seconds which we will retrieve data from the service.'));
    o.optional = false;
    o.datatype = 'integer';
    o.retain = true;
    o.depends('monitor_ipv6', '1');

    o = s.option(form.Value, 'ipv6_script_location', _('IPv6 Script Location'), _('The location of the IPv6 on change script to be triggered, use $1 to get the new IPv6 as input.'));
    o.optional = false;
    o.datatype = 'string';
    o.retain = true;
    o.depends('monitor_ipv6', '1');

    o = s.option(form.Value, 'history_location', _('History Location'), _('The location the IPv4 and IPv6 history is stored.'));
    o.optional = false;
    o.datatype = 'string';
    o.retain = true;
    // make history depend on either ipv4 and ipv6 monitor on
    o.depends('monitor_ipv4', '1');
    o.depends('monitor_ipv6', '1');

    o = s.option(form.Value, 'log_location', _('Log Location'), _('The location the log is stored.'));
    o.optional = false;
    o.datatype = 'string';
    o.retain = true;
    // make history depend on either ipv4 and ipv6 monitor on
    o.depends('monitor_ipv4', '1');
    o.depends('monitor_ipv6', '1');

    // Setting up IPv4 Tab
    s = m.section(form.TypedSection, 'ipv4', _('IPv4'));
    s.anonymous = true;

    // Setting up IPv6 Tab
    s = m.section(form.TypedSection, 'ipv6', _('IPv6'));
    s.anonymous = true;

    // Setting up History Tab
    s = m.section(form.TypedSection, 'history', _('History'));
    s.anonymous = true;

    // Setting up Logs Tab
    s = m.section(form.TypedSection, 'logs', _('Logs'));
    s.anonymous = true;

    return m.render().then((map) => {
      m
        .data
        .loaded
        .public_ip_monitor
        .then((data) => {
          // update global variables
          monitorIpv4 = data.general.monitor_ipv4
          monitorIpv6 = data.general.monitor_ipv6

          setTimeout(() => processPostRendering({monitorIpv4, monitorIpv6, ipv4ScriptContent, ipv6ScriptContent}), 0);
        });

      return map;
    });
  }
});
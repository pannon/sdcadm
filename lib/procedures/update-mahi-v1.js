/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

var p = console.log;
var assert = require('assert-plus');
var sprintf = require('extsprintf').sprintf;
var util = require('util'),
    format = util.format;
var child_process = require('child_process'),
    execFile = child_process.execFile,
    spawn = child_process.spawn;
var fs = require('fs');
var path = require('path');
var vasync = require('vasync');

var errors = require('../errors'),
    InternalError = errors.InternalError;
var common = require('../common');
var vmadm = require('../vmadm');
var svcadm = require('../svcadm');

var Procedure = require('./procedure').Procedure;
var s = require('./shared');

/**
 * A limited first attempt procedure for updating mahi.
 *
 * This is the first replacement for "upgrade-mahi.sh" from the
 * incr-upgrade scripts.
 *
 * Limitations:
 * - the service must only have one instance
 * - the instance must be on the headnode (where `sdcadm` is running)
 */
function UpdateMahiV1(options) {
    assert.arrayOfObject(options.changes, 'options.changes');
    this.changes = options.changes;
}
util.inherits(UpdateMahiV1, Procedure);

UpdateMahiV1.prototype.summarize = function ushiSummarize() {
    var word = (this.changes[0].type === 'rollback-service') ?
        'rollback' : 'update';
    return this.changes.map(function (ch) {
        return sprintf('%s "%s" service to image %s (%s@%s)', word,
            ch.service.name, ch.image.uuid, ch.image.name, ch.image.version);
    }).join('\n');
};

UpdateMahiV1.prototype.execute = function ushiExecute(opts, cb) {
    assert.object(opts, 'opts');
    assert.object(opts.sdcadm, 'opts.sdcadm');
    assert.object(opts.plan, 'opts.plan');
    assert.object(opts.log, 'opts.log');
    assert.func(opts.progress, 'opts.progress');
    assert.string(opts.wrkDir, 'opts.wrkDir');
    assert.func(cb, 'cb');
    var self = this;
    var rollback = opts.plan.rollback || false;

    function updateMahi(change, nextSvc) {
        var arg = {
            change: change,
            opts: opts,
            userScript: false
        };

        var funcs = [s.ensureDelegateDataset];
        if (rollback) {
            funcs.push(s.getOldUserScript);
        } else {
            funcs.push(s.getUserScript);
            funcs.push(s.writeOldUserScriptForRollback);
        }

        funcs = funcs.concat([
            s.updateSvcUserScript,
            s.updateVmUserScript,
            s.updateSapiSvc,
            s.imgadmInstall,
            s.reprovision,
            s.waitForInstToBeUp
        ]);

        vasync.pipeline({funcs: funcs, arg: arg}, nextSvc);
    }

    vasync.forEachPipeline({
        inputs: self.changes,
        func: updateMahi
    }, cb);
};
//---- exports

module.exports = {
    UpdateMahiV1: UpdateMahiV1
};
// vim: set softtabstop=4 shiftwidth=4:

---
title: sdcadm proposal/design notes
markdown2extras: wiki-tables, code-friendly, cuddled-lists, link-patterns
markdown2linkpatternsfile: link-patterns.txt
apisections:
---

# sdcadm instances

Lists all SDC instances (core zones, agent deployments, etc.). Example:

    [root@headnode (coal) ~]# sdcadm insts
    SERVICE          HOSTNAME  IMAGE/VERSION                           ZONENAME                              ALIAS
    adminui          headnode  c77c6170-c684-11e3-a923-f70fb5d07369    4b25e075-417b-431a-b714-64d71af11482  adminui0
    amon             headnode  ca24dee8-c666-11e3-bf00-4f6cfefc1a5f    770f1118-ef8d-485d-b8d4-995c2b2176dc  amon0
    amonredis        headnode  c573c53a-c59e-11e3-9127-535b051b6fa0    7e3b1de5-fa05-4e30-8d6c-2cf3944ea0e3  amonredis0
    assets           headnode  d8c432fe-c667-11e3-b488-33d233e7ce30    4074bfc0-9736-4b01-b54e-f5e8cd813588  assets0
    binder           headnode  f9ae21ae-c668-11e3-94db-e7b0bd3f7d06    7de9fcbe-16c8-4138-ba31-fc24b9bd17de  binder0
    ca               headnode  41a93886-c664-11e3-90e0-8b1841a582e9    a2cb3d39-41c6-498a-a03b-04dc6eb5d95c  ca0
    ...
    provisioner      headnode  2.3.0                                   -                                     -
    smartlogin       headnode  0.1.0                                   -                                     -
    zonetracker      headnode  1.0.1                                   -                                     -


# sdcadm services

List all SDC services. It shows unique "(service, image)" combinations. E.g.:

    [root@headnode (us-beta-4) ~]# sdcadm svcs
    SERVICE          IMAGE                                 VERSION                                 COUNT
    ...
    imgapi           0ac605e2-66b0-4789-e4ed-de0f25042f34  master-20140317T224857Z-g6e0633c        1
    manatee          187f8a96-bea3-11e3-ba5e-13daee91cc4e  master-20140407T221703Z-g41f2155        3
    moray            a3fca478-bb83-11e3-896b-ff991348bad0  master-20140403T225148Z-geb8db23        2
    napi             4a8850d2-1874-c8fe-bc14-9231690d49e6  master-20140227T193003Z-g66705ce        1
    ...
    cabase           -                                     1.0.3vmaster-20131204T194515Z-gd1e3e5b  1
    cabase           -                                     1.0.3vmaster-20140220T230929Z-gaa19d5c  3
    cainstsvc        -                                     0.0.3vmaster-20131204T194515Z-gd1e3e5b  1
    cainstsvc        -                                     0.0.3vmaster-20140220T230929Z-gaa19d5c  3
    ...

Similar to some `manta-adm show` forms.


# sdcadm self-update

Find the latest `sdcadm` image in updates.joyent.com, download it and
install.


# sdcadm update

The command to update SDC instances (core zones, agents, etc.). A simple
example would be updating one of the stateless core zones to the latest
available image, e.g.: `sdcadm update cnapi`

- find the latest cnapi image (these are the "changes")
- create /var/sdcadm/updates/$timestamp/plan.json (the "plan"), this is the
  updated `sdcadm instances -j` state.
- confirm changes
- execute plan.json (details on how particular services are upgraded is
  discussed later)
- note the update in its history (in a 'sdcadm_history' bucket in moray)

Calling forms:

    sdcadm update <svc> [<svc> ...]
        Where '<svc>' is just the name, e.g. 'cnapi', for the latest
        available. Or 'cnapi@1.2.3' for that version (or latest of that ver
        if multiple images with that ver). Or 'cnapi@UUID' for a specific
        cnapi. Or just 'UUID' because that in unambiguous.
    sdcadm update <inst> [<inst> ...]
        Where '<inst>' is a specific instance (per `sdcadm insts`),
        e.g. 'cnapi0'.  Not sure if upgrades of just single instances of a
        service should be allowed? Useful for e.g. testing interactions and
        perhaps for dev. Perhaps for upgrading agents on a single CN.
    sdcadm update -f <./local-upgrade-file.json>
        Upgrade a set of services (or instances) per a simple changes JSON
        format. This mirrors the "upgrade-images" file in current
        incr-upgrade scripts
        (https://mo.joyent.com/usb-headnode/blob/master/incr-upgrade-scripts/README.md).
        This could also be useful for airgap upgrades provided to customers on
        some media: a tarball of images with a "update.json".
            [
                {"service": "cnapi", "image": "<uuid-or-local-path>"},
                {"service": "provisioner", "image": "<uuid-or-local-path>"}
                ...
            }
        Can also pass in this payload on stdin, e.g.:
            echo '{
                "service": "dapi",
                "image": "11f2be78-fc8c-e556-bc01-ecdbc3fb4e66"
            }' | sdcadm update
    sdcadm update
        Update all services to the latest available image.
    sdcadm update --plan <path>
        Update everything in SDC to match this plan file. Could be useful
        for an eventual 'sdcadm setup' taking over HN setup from headnode.sh.
        Also, this maps to `manta-adm update`'s design.

There are more examples below that also cover cases like adding a new
instance of a service, or deleting one.

A note on SAPI /instances. I'm proposing that /instances change to be a
reflection of actual state (core zones from VMAPI
ListVms?owner_uuid=$admin&tags.smartdc_role, current deployed agents from CNAPI
ServerList?extras=sysinfo) rather than its current possible split brain set
of instances. We should maintain the ability to have special SAPI metadata
defined on an instance (my understanding is this is rare, tho at least one
used case for NODE_ONE_WRITE_MODE for manatee).

'sdcadm update' failure. Because we generate a target plan.json, we can
have a `sdcadm update --retry|--resume|--whatever` that will re-confirm and
execute the "plan.json" from the latest upgrade attempt.


# sdcadm rollback

Support just one level of rollback. Find the last
"/var/sdcadm/updates/$timestamp/curr-state.json" (each upgrade will record
the current state of the world) and use that for the "plan.json".

    $ sdcadm rollback
    Last update was at $timestamp
    * * *
    Rollback will make the following changes:
        rollback cnapi0 to 1.2.3 (<uuid>) from 1.2.4 (<uuid>)

    Would you like to continue with the rollback? [y/N] y
    * * *
    ...
    Successfully rolled back (elapsed 65s)

We occassionally have data migration changes in new revs of services that
make rollback hard (or practically impossible). All a given update has
is the current image manifest and the target image manifest. We could either
have a `manifest.tags.sdcMigrationRev = <integer>` or choose a convention that
a *major* version change implies a migration across which rollback is not
supported.

    $ sdcadm rollback
    Last update was at $timestamp
    sdcadm rollback: error (RollbackAcrossMigration): cannot rollback cnapi0 from 2.0.0 to 1.2.3 across a migration rev (sdcMigrationRev 3 to 2)


# sdcadm history

We keep a history of updates in a 'sdcadm_history' moray bucket. This
command lists the history a la `zpool history`.


# 'sdcadm update/create' examples

Update a service (all instances):

    sdcadm update dapi
    sdcadm update dapi -i 11f2be78-fc8c-e556-bc01-ecdbc3fb4e66

which is a shortcut for:

    # Upgrade all instances in the 'dapi' service to the given image.
    echo '{
        "service": "dapi",
        "image": "11f2be78-fc8c-e556-bc01-ecdbc3fb4e66"
    }' | sdcadm update

    # Or, just upgrade a particular instance, as follows. Here 'alias' or
    # VM 'uuid' is sufficient to unique identify a "zone" instance.
    $ echo '{
        "alias": "dapi0",
        "image": "11f2be78-fc8c-e556-bc01-ecdbc3fb4e66"
    }' | sdcadm update

    # or this:
    $ echo '{
        "uuid": "a8f5bd32-c24d-374b-b668-3f6e1349ddaa",
        "image": "11f2be78-fc8c-e556-bc01-ecdbc3fb4e66"
    }' | sdcadm update

    # Or a particular *agent* is identified by server (or hostname) and
    # service name (i.e. the agent name).
    $ echo '{
        "server": "headnode",
        "service": "provisioner",
        "image": "11f2be78-fc8c-e556-bc01-ecdbc3fb4e66"
    }' | sdcadm update

Add a new dapi instance:

    $ echo '{
        "create": true,
        "image": "11f2be78-fc8c-e556-bc01-ecdbc3fb4e66",
    }' | sdcadm update
    sdcadm update: error (SomeCodeXXX): must specify 'server' (or 'hostname') for a new instance

    $ echo '{
        "create": true,
        "image": "11f2be78-fc8c-e556-bc01-ecdbc3fb4e66",
        "hostname": "headnode"
    }' | sdcadm update
    Provision new instance: $uuid (dapi1, service 'dapi', image $image_uuid, server $server_uuid)

    # Or the same to 'sdcadm create' (tho the 'create': true is implied there)
    $ echo '{
        "image": "11f2be78-fc8c-e556-bc01-ecdbc3fb4e66",
        "hostname": "headnode"
    }' | sdcadm update
    Create new zone: $uuid (dapi1, service 'dapi', image $image_uuid, server $server_uuid)

    # Create cloudapi
    sdcadm create cloudapi -s $server_uuid
    sdcadm create cloudapi -H $hostname
    sdcadm create -H headnode cloudapi

Agent examples:

    sdcadm update provisioner    # update provisioner on *all* CNs
    sdcadm update -s SERVER,SERVER,SERVER -s SERVER provisioner \
        -i IMAGE

Perhaps we add a '-c COND' predicate for which servers to include/exclude
a la `json -c COND ...`? Or clearer to have `sdcadm cn -n <filters...>`
for that a la `manta-adm cn -n ...`.



# sdcadm check (or something like this)

Check that real data matches the definition of the world in SAPI.
Check that the current state conforms to suggestions for HA. SAPI services
could grow a "min_instances = 3" attribute for these suggestions.

- check: instances match the real ones
- warning: whether SAPI service params at all match current state. They
  don't necessarily *need* to, but perhaps we should enforce that. E.g. if
  the SAPI service says image_uuid A, but live instances have B... is that
  an error, or just a warning because could be transient?

Aside:

- check expected invariants in 'sdc-foundation'. Need to spec out
  'sdc-foundation' cases.
  **Note:** Not sure this applies here. 'sdc-foundation' is
  "do these changes for this upgrade, else the upgrade failed".


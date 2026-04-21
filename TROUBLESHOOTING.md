# Troubleshooting

## Podman

#### What if `yarn run start-console` fails to start

```sh
yarn run start-console

Starting local OpenShift console...
[...]
Writing manifest to image destination
SIGSEGV: segmentation violation
PC=0x18021ae m=6 sigcode=1 addr=0xffffffff8c088ee0

goroutine 0 gp=0xc0001821c0 m=6 mp=0xc000180008 [idle]:
runtime.netpoll(0xc00006e000?)
	/usr/lib/golang/src/runtime/netpoll_epoll.go:169 +0x24e fp=0xffff237fdbb8 sp=0xffff237fd530 pc=0x18021ae
runtime.findRunnable()
	/usr/lib/golang/src/runtime/proc.go:3657 +0x8c5 fp=0xffff237fdd30 sp=0xffff237fdbb8 pc=0x180f765
runtime.schedule()
	/usr/lib/golang/src/runtime/proc.go:4072 +0xb1 fp=0xffff237fdd68 sp=0xffff237fdd30 pc=0x1810d31
runtime.park_m(0xc000182700)
	/usr/lib/golang/src/runtime/proc.go:4201 +0x285 fp=0xffff237fddc8 sp=0xffff237fdd68 pc=0x18111a5
runtime.mcall()
	/usr/lib/golang/src/runtime/asm_amd64.s:459 +0x4e fp=0xffff237fdde0 sp=0xffff237fddc8 pc=0x18466ee
[...]
```

#### Cause
This might happen on ARM Silicon, since one of the required images (https://quay.io/repository/openshift/origin-console) is not built for ARM arch.

#### Solution
Install in your Podman VM `qemu-user-static`

```sh
podman machine ssh [PODMAN_MACHINE_NAME]
Connecting to vm podman-machine-default. To close connection, use `~.` or `exit`
Fedora CoreOS 43.20251110.3.1
[...]
```

```sh
root@localhost:~# sudo rpm-ostree install qemu-user-static
```
Note: `[PODMAN_MACHINE_NAME]` can be omitted if you are working with the default one. Same for every example that follows.

#### However, the snippet above may fail:

```sh
root@localhost:~# sudo rpm-ostree install qemu-user-static
Updating and loading repositories:
[...]
Error: this bootc system is configured to be read-only. For more information, run `bootc --help`.
```

#### Cause
As the error well described it: The bootc system is configured to be read-only.

#### Solution
You will need to build a writeable podman machine, follow the instructions here https://github.com/containers/podman-machine-os. Note that **only works on Linux...**

#### Alternative
Try with [aptman/qus](https://github.com/dbhi/qus)

```sh
podman run --rm --privileged aptman/qus -s -- -p
✔ docker.io/aptman/qus:latest
Trying to pull docker.io/aptman/qus:latest...
Getting image source signatures
[...]
```

```sh
podman machine ssh
Connecting to vm podman-machine-default. To close connection, use `~.` or `exit`
Fedora CoreOS 43.20251110.3.1
```

```sh
root@localhost:~# cat /proc/sys/fs/binfmt_misc/qemu-x86_64
enabled
interpreter /qus/bin/qemu-x86_64-static
flags: F
offset 0
magic 7f454c4602010100000000000000000002003e00
mask fffffffffffefe00fffffffffffffffffeffffff
```

#### Alternative 2
Try creating a podman machine with a base image that works, such as [fedora@39](https://builds.coreos.fedoraproject.org/prod/streams/stable/builds/39.20240407.3.0/aarch64/fedora-coreos-39.20240407.3.0-applehv.aarch64.raw.gz).
For some reason, every other image tried failed with the segfault, but that one and previous ones.

```sh
podman machine init --disk-size 60 --rootful --cpus=4 --memory=8192 --image https://builds.coreos.fedoraproject.org/prod/streams/stable/builds/39.20240407.3.0/aarch64/fedora-coreos-39.20240407.3.0-applehv.aarch64.raw.gz
```

***Profit!***

### Limitations

The latest console plugin images crashes on ARM due to a Go runtime bug in older Go versions when running linux/amd64 binaries under QEMU emulation OR Rosetta on Podman only, apparently.


#### Why This Happens
So far with the testing done with Podman in ARM:

- There's been a change in the Fedora CoreOS base image that so far there's nothing conclusive, but [this discussion](https://github.com/containers/podman/discussions/22714) provided the actual fix in the Alternative 2.

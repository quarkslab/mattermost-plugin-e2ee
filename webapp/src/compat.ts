let SupportE2EEPostUpdate = false;

export function setE2EEPostUpdateSupported(val: boolean) {
    SupportE2EEPostUpdate = val;
}

export function getE2EEPostUpdateSupported() {
    return SupportE2EEPostUpdate;
}

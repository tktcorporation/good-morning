import { SleepDurationPickerModal } from 'good-morning';

const noop = () => {};

export function Unset() {
  return <SleepDurationPickerModal visible={true} currentValue={null} onSave={noop} onClose={noop} />;
}

export function EightHours() {
  return <SleepDurationPickerModal visible={true} currentValue={480} onSave={noop} onClose={noop} />;
}

export function TenHours() {
  return <SleepDurationPickerModal visible={true} currentValue={600} onSave={noop} onClose={noop} />;
}

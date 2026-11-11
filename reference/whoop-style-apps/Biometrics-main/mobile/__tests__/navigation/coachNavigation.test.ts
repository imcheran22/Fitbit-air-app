import { navigateToCoachEntry } from '../../src/navigation/coachNavigation';

describe('navigateToCoachEntry', () => {
  it('opens the Coach tab', () => {
    const navigation = { navigate: jest.fn() };
    navigateToCoachEntry(navigation, 'Coach');
    expect(navigation.navigate).toHaveBeenCalledWith('Tabs', { screen: 'Coach' }, { pop: true });
  });

  it('opens the Coach tab with a prefill', () => {
    const navigation = { navigate: jest.fn() };
    navigateToCoachEntry(navigation, 'Coach', 'Why did my score change today?');
    expect(navigation.navigate).toHaveBeenCalledWith('Tabs', { screen: 'Coach', params: { prefill: 'Why did my score change today?' } }, { pop: true });
  });

  it('opens the consent screen, which is pushed over the tabs', () => {
    const navigation = { navigate: jest.fn() };
    navigateToCoachEntry(navigation, 'CoachConsent');
    expect(navigation.navigate).toHaveBeenCalledTimes(1);
    expect(navigation.navigate).toHaveBeenCalledWith('CoachConsent');
  });

  it('opens the consent screen carrying a prefill', () => {
    const navigation = { navigate: jest.fn() };
    navigateToCoachEntry(navigation, 'CoachConsent', 'Hi');
    expect(navigation.navigate).toHaveBeenCalledWith('CoachConsent', { prefill: 'Hi' });
  });
});

import React from 'react';
import { render } from '@testing-library/react-native';
import { TabsNavigator } from '../../src/navigation/TabsNavigator';
import { FloatingTabBar } from '../../src/navigation/FloatingTabBar';
import { TAB_ORDER } from '../../src/navigation/tabBarLayout';

const mockScreens: string[] = [];
const mockComponents: Record<string, unknown> = {};
let mockInitialRoute: string | undefined;
let mockTabBar: ((props: object) => React.ReactElement) | undefined;
jest.mock('@react-navigation/bottom-tabs', () => {
  const ReactLib = require('react');
  return {
    createBottomTabNavigator: () => ({
      Navigator: ({ children, tabBar, initialRouteName }: any) => {
        mockScreens.splice(0, mockScreens.length, ...ReactLib.Children.toArray(children).map((c: any) => c.props.name));
        ReactLib.Children.toArray(children).forEach((c: any) => { mockComponents[c.props.name] = c.props.component; });
        mockTabBar = tabBar;
        mockInitialRoute = initialRouteName;
        return null;
      },
      Screen: () => null,
    }),
  };
});

describe('TabsNavigator', () => {
  it('registers the five tabs in bar order, opening on Home', () => {
    render(<TabsNavigator />);

    expect(mockScreens).toEqual([...TAB_ORDER]);
    expect(mockInitialRoute).toBe('Home');
  });

  it('puts the Social screen in the slot Metrics had', () => {
    render(<TabsNavigator />);

    expect(mockScreens).not.toContain('Metrics');
    expect(mockComponents.Social).toBe(require('../../src/screens/SocialScreen').SocialScreen);
  });

  it('renders the floating bar instead of the default tab bar', () => {
    render(<TabsNavigator />);

    const element = mockTabBar!({});
    expect(element.type).toBe(FloatingTabBar);
  });
});

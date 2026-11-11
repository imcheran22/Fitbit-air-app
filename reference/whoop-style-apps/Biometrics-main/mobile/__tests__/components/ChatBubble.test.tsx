import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { ChatBubble } from '../../src/components/ui/chat-bubble';

describe('ChatBubble', () => {
  it('renders a user message as plain text on the right', () => {
    const { getByTestId } = render(<ChatBubble role="user" text="Why did my score change today?" />);

    expect(getByTestId('chat-bubble-user')).toHaveTextContent('Why did my score change today?');
  });

  it('renders an assistant message with its full text', () => {
    const { getByTestId } = render(<ChatBubble role="assistant" text="Your sleep was shorter than usual." />);

    expect(getByTestId('chat-bubble-assistant')).toHaveTextContent('Your sleep was shorter than usual.');
  });

  it('renders a fallback assistant message exactly like a normal one', () => {
    const normal = render(<ChatBubble role="assistant" text="Same text" source="model" animate={false} />);
    const fallback = render(<ChatBubble role="assistant" text="Same text" source="fallback" animate={false} />);

    expect(JSON.stringify(fallback.toJSON())).toEqual(JSON.stringify(normal.toJSON()));
  });

  it('renders footer content beneath the text', () => {
    const { getByTestId } = render(
      <ChatBubble role="assistant" text="Body">
        <Text testID="footer">Footer</Text>
      </ChatBubble>,
    );

    expect(getByTestId('footer')).toBeTruthy();
  });

  it('never fades a user message', () => {
    const { getByTestId } = render(<ChatBubble role="user" text="Hi" />);
    expect(getByTestId('chat-bubble-user')).toBeTruthy();
  });
});

import { HStack, Spacer, Text, VStack, ZStack } from '@expo/ui/swift-ui';
import {
  clipShape,
  containerBackground,
  font,
  foregroundStyle,
  frame,
  padding,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

export type NowPlayingWidgetProps = {
  title: string;
  artist: string;
  status: string;
};

const NowPlayingView = (props: NowPlayingWidgetProps, environment: WidgetEnvironment) => {
  'widget';
  const small = environment.widgetFamily === 'systemSmall';
  return (
    <ZStack
      alignment="leading"
      modifiers={[containerBackground('#2c2e33', 'widget'), clipShape('containerRelativeShape')]}>
      <VStack
        alignment="leading"
        spacing={small ? 4 : 8}
        modifiers={[frame({ maxWidth: Infinity, alignment: 'leading' }), padding({ all: 16 })]}>
        <Text modifiers={[font({ weight: 'medium', size: 12 }), foregroundStyle('#f08a24')]}>
          Music Player
        </Text>
        <Spacer />
        <Text
          modifiers={[
            font({ weight: 'bold', size: small ? 16 : 20 }),
            foregroundStyle('#f3f4f6'),
          ]}>
          {props.title}
        </Text>
        {!small ? (
          <Text modifiers={[font({ weight: 'medium', size: 13 }), foregroundStyle('#a7abb3')]}>
            {props.artist}
          </Text>
        ) : null}
        <HStack>
          <Text modifiers={[font({ weight: 'medium', size: 12 }), foregroundStyle('#86c445')]}>
            {props.status}
          </Text>
        </HStack>
      </VStack>
    </ZStack>
  );
};

export default createWidget('NowPlayingWidget', NowPlayingView);

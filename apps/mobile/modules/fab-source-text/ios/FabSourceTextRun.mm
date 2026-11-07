#import "FabSourceTextRun.h"
#import <React/RCTFabricComponentsPlugins.h>
#import "FabSourceTextRunComponentDescriptor.h"
#import <react/renderer/components/FabSourceTextSpec/Props.h>
#import <react/renderer/components/FabSourceTextSpec/RCTComponentViewHelpers.h>

using namespace facebook::react;

@interface FabSourceTextRun () <RCTT3SourceTextRunViewProtocol>

@end

@implementation FabSourceTextRun {
  NSString *_text;
}

+ (ComponentDescriptorProvider)componentDescriptorProvider {
  return concreteComponentDescriptorProvider<
      FabSourceTextRunComponentDescriptor>();
}

- (instancetype)initWithFrame:(CGRect)frame {
  if (self = [super initWithFrame:frame]) {
    static const auto defaultProps =
        std::make_shared<const FabSourceTextRunProps>();
    _props = defaultProps;
  }
  return self;
}

- (void)updateProps:(Props::Shared const &)props
           oldProps:(Props::Shared const &)oldProps {
  const auto &oldViewProps =
      *std::static_pointer_cast<FabSourceTextRunProps const>(_props);
  const auto &newViewProps =
      *std::static_pointer_cast<FabSourceTextRunProps const>(props);

  if (newViewProps.text != oldViewProps.text) {
    NSString *text = [NSString stringWithUTF8String:newViewProps.text.c_str()];
    _text = text;
  }

  [super updateProps:props oldProps:oldProps];
}

+ (BOOL)shouldBeRecycled {
  return NO;
}

Class<RCTComponentViewProtocol> FabSourceTextRunCls(void) {
  return FabSourceTextRun.class;
}

@end

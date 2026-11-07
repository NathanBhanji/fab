#import <React/RCTUIManager.h>
#import <React/RCTViewManager.h>

@interface FabSourceTextManager : RCTViewManager
@end

@implementation FabSourceTextManager

RCT_EXPORT_MODULE(FabSourceText)

- (UIView *)view {
  return [[UIView alloc] init];
}

@end

@interface FabSourceTextRunManager : RCTViewManager
@end

@implementation FabSourceTextRunManager

RCT_EXPORT_MODULE(FabSourceTextRun)

- (UIView *)view {
  return nil;
}

@end

//
//  QuantDesk.m — 量化工作台 iOS 外壳
//  纯 ObjC + UIKit + WKWebView，内嵌离线 PWA，无网络依赖
//

#import <UIKit/UIKit.h>
#import <WebKit/WebKit.h>

static NSString *const QDBridgePrefix = @"__qd_ls__";

#pragma mark - LocalStorage 兜底桥

@interface QDWebViewController : UIViewController <WKNavigationDelegate, WKUIDelegate>

@property (nonatomic, strong) WKWebView *webView;
@property (nonatomic, strong) NSURL *webRoot;

@end

@implementation QDWebViewController

- (void)viewDidLoad {
    [super viewDidLoad];

    self.view.backgroundColor = [UIColor colorWithRed:0x09 / 255.0
                                                green:0x0c / 255.0
                                                 blue:0x11 / 255.0
                                                alpha:1.0];

    WKWebViewConfiguration *cfg = [[WKWebViewConfiguration alloc] init];
    cfg.allowsInlineMediaPlayback = YES;
    cfg.suppressesIncrementalRendering = NO;

    // 允许 file:// 页面读取同目录资源与本地存储
    @try {
        [cfg.preferences setValue:@YES forKey:@"allowFileAccessFromFileURLs"];
        [cfg.preferences setValue:@YES forKey:@"allowUniversalAccessFromFileURLs"];
    } @catch (NSException *e) {
        NSLog(@"QD: preference set failed: %@", e);
    }

    // 注入 localStorage 兜底：仅在原生存储不可用时生效
    NSString *shim = [self localStorageShimSource];
    WKUserScript *us = [[WKUserScript alloc] initWithSource:shim
                                              injectionTime:WKUserScriptInjectionTimeAtDocumentStart
                                           forMainFrameOnly:YES];
    [cfg.userContentController addUserScript:us];

    self.webView = [[WKWebView alloc] initWithFrame:self.view.bounds configuration:cfg];
    self.webView.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
    self.webView.navigationDelegate = self;
    self.webView.UIDelegate = self;
    self.webView.opaque = YES;
    self.webView.backgroundColor = self.view.backgroundColor;
    self.webView.scrollView.bounces = NO;
    self.webView.scrollView.backgroundColor = self.view.backgroundColor;
    self.webView.allowsBackForwardNavigationGestures = NO;

    [self.view addSubview:self.webView];

    // 底部安全区交给页面，其余由 WKWebView 自动内缩
    self.webRoot = [[[NSBundle mainBundle] resourceURL] URLByAppendingPathComponent:@"web" isDirectory:YES];
    NSURL *indexURL = [self.webRoot URLByAppendingPathComponent:@"index.html"];
    [self.webView loadFileURL:indexURL allowingReadAccessToURL:self.webRoot];
}

- (UIStatusBarStyle)preferredStatusBarStyle {
    return UIStatusBarStyleLightContent;
}

- (BOOL)prefersHomeIndicatorAutoHidden {
    return NO;
}

#pragma mark - 存储兜底脚本

- (NSString *)localStorageShimSource {
    return [NSString stringWithFormat:
        @"(function(){"
         "var P='%@';"
         "function br(c){try{return window.prompt(P+c,'');}catch(e){return null;}}"
         "var ok=false;"
         "try{window.localStorage.setItem(P+'p','1');window.localStorage.removeItem(P+'p');ok=true;}catch(e){ok=false;}"
         "if(ok)return;"
         "function Shim(){}"
         "Shim.prototype.getItem=function(k){var v=br('g:'+k);return (v===null||v==='__null__')?null:v;};"
         "Shim.prototype.setItem=function(k,v){br('s:'+k+'\\u0001'+String(v));};"
         "Shim.prototype.removeItem=function(k){br('r:'+k);};"
         "Shim.prototype.clear=function(){br('c:');};"
         "Shim.prototype.key=function(i){var v=br('k:'+i);return (v==='__null__')?null:v;};"
         "Object.defineProperty(Shim.prototype,'length',{get:function(){var v=br('n:');return v?parseInt(v,10)||0:0;}});"
         "try{Object.defineProperty(window,'localStorage',{configurable:true,get:function(){return new Shim();}});}"
         "catch(e){try{window.localStorage=new Shim();}catch(e2){}}"
         "})();", QDBridgePrefix];
}

#pragma mark - prompt 桥接（同步取/存 NSUserDefaults）

- (void)webView:(WKWebView *)webView
    runJavaScriptTextInputPanelWithPrompt:(NSString *)prompt
                              defaultText:(NSString *)defaultText
                         initiatedByFrame:(WKFrameInfo *)frame
                        completionHandler:(void (^)(NSString * _Nullable))completionHandler {

    if (![prompt hasPrefix:QDBridgePrefix]) {
        completionHandler(nil);
        return;
    }

    NSString *cmd = [prompt substringFromIndex:QDBridgePrefix.length];
    NSUserDefaults *ud = [NSUserDefaults standardUserDefaults];
    NSString *storeKey = @"__qd_webstorage__";
    NSMutableDictionary *bag = [[ud dictionaryForKey:storeKey] mutableCopy] ?: [NSMutableDictionary dictionary];
    NSString *result = nil;

    if ([cmd hasPrefix:@"g:"]) {
        NSString *k = [cmd substringFromIndex:2];
        id v = bag[k];
        result = v ? [v description] : @"__null__";
    } else if ([cmd hasPrefix:@"s:"]) {
        NSString *rest = [cmd substringFromIndex:2];
        NSRange sep = [rest rangeOfString:@"\001"];
        if (sep.location != NSNotFound) {
            NSString *k = [rest substringToIndex:sep.location];
            NSString *v = [rest substringFromIndex:sep.location + sep.length];
            bag[k] = v;
            [ud setObject:bag forKey:storeKey];
            result = @"1";
        } else {
            result = @"0";
        }
    } else if ([cmd hasPrefix:@"r:"]) {
        [bag removeObjectForKey:[cmd substringFromIndex:2]];
        [ud setObject:bag forKey:storeKey];
        result = @"1";
    } else if ([cmd hasPrefix:@"c:"]) {
        [ud removeObjectForKey:storeKey];
        result = @"1";
    } else if ([cmd hasPrefix:@"k:"]) {
        NSInteger idx = [[cmd substringFromIndex:2] integerValue];
        NSArray *keys = [bag.allKeys sortedArrayUsingSelector:@selector(compare:)];
        result = (idx >= 0 && idx < (NSInteger)keys.count) ? keys[idx] : @"__null__";
    } else if ([cmd hasPrefix:@"n:"]) {
        result = [NSString stringWithFormat:@"%lu", (unsigned long)bag.count];
    } else {
        result = @"__null__";
    }

    completionHandler(result);
}

#pragma mark - 导航

- (void)webView:(WKWebView *)webView
    decidePolicyForNavigationAction:(WKNavigationAction *)navigationAction
                    decisionHandler:(void (^)(WKNavigationActionPolicy))decisionHandler {

    NSURL *url = navigationAction.request.URL;
    if (url && [url.scheme isEqualToString:@"file"]) {
        decisionHandler(WKNavigationActionPolicyAllow);
        return;
    }
    // 外链交给系统
    if (url && (navigationAction.navigationType == WKNavigationTypeLinkActivated)) {
        [[UIApplication sharedApplication] openURL:url options:@{} completionHandler:nil];
        decisionHandler(WKNavigationActionPolicyCancel);
        return;
    }
    decisionHandler(WKNavigationActionPolicyAllow);
}

- (void)webView:(WKWebView *)webView
    didFailProvisionalNavigation:(WKNavigation *)navigation
                       withError:(NSError *)error {
    NSLog(@"QD: provisional load failed: %@", error);
}

@end

#pragma mark - AppDelegate

@interface QDAppDelegate : UIResponder <UIApplicationDelegate>
@property (nonatomic, strong) UIWindow *window;
@end

@implementation QDAppDelegate

- (BOOL)application:(UIApplication *)application
    didFinishLaunchingWithOptions:(NSDictionary *)launchOptions {

    self.window = [[UIWindow alloc] initWithFrame:[UIScreen mainScreen].bounds];
    self.window.backgroundColor = [UIColor colorWithRed:0x09 / 255.0
                                                  green:0x0c / 255.0
                                                   blue:0x11 / 255.0
                                                  alpha:1.0];
    self.window.rootViewController = [[QDWebViewController alloc] init];
    [self.window makeKeyAndVisible];
    return YES;
}

@end

int main(int argc, char *argv[]) {
    @autoreleasepool {
        return UIApplicationMain(argc, argv, nil, NSStringFromClass([QDAppDelegate class]));
    }
}

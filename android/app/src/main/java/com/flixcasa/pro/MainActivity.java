package com.flixcasa.pro;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
	@Override
	public void onCreate(Bundle savedInstanceState) {
		super.onCreate(savedInstanceState);
		WebView webView = getBridge().getWebView();
		WebSettings settings = webView.getSettings();
		settings.setJavaScriptEnabled(true);
		settings.setDomStorageEnabled(true);
		settings.setAllowFileAccess(true);
		settings.setMediaPlaybackRequiresUserGesture(false);
		settings.setUserAgentString(settings.getUserAgentString() + " FlixCasaAndroid/1.0");
		webView.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
		webView.setLayerType(WebView.LAYER_TYPE_HARDWARE, null);
	}
}

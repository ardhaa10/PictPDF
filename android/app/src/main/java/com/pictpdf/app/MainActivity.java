package com.pictpdf.app;

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);
        
        // Ensure native ActionBar is hidden
        if (getSupportActionBar() != null) {
            getSupportActionBar().hide();
        }
    }
}

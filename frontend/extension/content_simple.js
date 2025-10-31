// ULTRA SIMPLE CONTENT SCRIPT TEST - v2.0 - WITH ERROR CATCHING
try {
    console.log('🚀 STEP 1: Content script starting...');
    
    console.log('🚀 STEP 2: Setting window flag...');
    window.__SPIKELY_CONTENT_ACTIVE__ = true;
    
    console.log('🚀 STEP 3: Creating test function...');
    window.__SPIKELY_SIMPLE_TEST__ = function() {
        console.log('🧪 TEST FUNCTION EXECUTED!');
        return 'SUCCESS';
    };
    
    console.log('🚀 STEP 4: Testing function immediately...');
    const testResult = window.__SPIKELY_SIMPLE_TEST__();
    console.log('🚀 STEP 5: Function test result:', testResult);
    
    console.log('✅ CONTENT SCRIPT COMPLETED SUCCESSFULLY');
    
} catch (error) {
    console.error('❌ CONTENT SCRIPT ERROR:', error);
    console.error('❌ ERROR STACK:', error.stack);
}
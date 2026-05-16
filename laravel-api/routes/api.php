<?php

use App\Http\Controllers\OfferingController;
use App\Http\Controllers\IssuerController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Buzfundr API Routes
|--------------------------------------------------------------------------
| Prefix: /api
*/

// ═══════════ ISSUERS ═══════════
Route::prefix('issuers')->controller(IssuerController::class)->group(function () {
    Route::get('/', 'index');
    Route::post('/', 'store');
    Route::get('/{id}', 'show');
    Route::post('/{id}/document', 'uploadDocument');
});

// ═══════════ OFFERINGS ═══════════
Route::prefix('offerings')->controller(OfferingController::class)->group(function () {
    Route::get('/', 'index');
    Route::post('/', 'store');
    Route::get('/{id}', 'show');

    // Blockchain Operations
    Route::post('/invest', 'invest');
    Route::post('/refund', 'refund');
    Route::post('/release', 'release');
    Route::post('/fail', 'fail');
    Route::post('/emergency-refund', 'emergencyRefund');
    Route::post('/amend', 'amend');

    // Read
    Route::get('/{id}/vault', 'vaultStatus');
    Route::get('/{id}/history', 'history');
});

// ═══════════ TESTING HELPERS ═══════════
Route::post('/test/recharge', [OfferingController::class, 'recharge']);
Route::post('/test/advance-time', [OfferingController::class, 'advanceTime']);

// ═══════════ HEALTH ═══════════
Route::get('/health', fn() => response()->json([
    'status' => 'ok',
    'service' => 'bizfundr-laravel-api',
    'time' => now()->toISOString(),
]));

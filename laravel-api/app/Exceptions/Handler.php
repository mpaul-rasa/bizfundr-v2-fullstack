<?php

namespace App\Exceptions;

use Illuminate\Foundation\Exceptions\Handler as ExceptionHandler;
use Illuminate\Validation\ValidationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Auth\AuthenticationException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\HttpKernel\Exception\MethodNotAllowedHttpException;
use Throwable;

class Handler extends ExceptionHandler
{
    /**
     * Register the exception handling callbacks for the application.
     */
    public function register(): void
    {
        // ═══════════ BLOCKCHAIN ERRORS ═══════════
        $this->renderable(function (BlockchainException $e) {
            return response()->json([
                'success' => false,
                'error_code' => $e->errorCode,
                'message' => $e->getMessage(),
                'hint' => $e->hint,
            ], $e->statusCode);
        });

        // ═══════════ VALIDATION ERRORS ═══════════
        $this->renderable(function (ValidationException $e) {
            return response()->json([
                'success' => false,
                'error_code' => 'VALIDATION_ERROR',
                'message' => 'The submitted data is invalid.',
                'errors' => $e->errors(),
            ], 422);
        });

        // ═══════════ NOT FOUND ═══════════
        $this->renderable(function (ModelNotFoundException $e) {
            $model = class_basename($e->getModel());
            return response()->json([
                'success' => false,
                'error_code' => 'NOT_FOUND',
                'message' => "{$model} not found.",
            ], 404);
        });

        $this->renderable(function (NotFoundHttpException $e) {
            return response()->json([
                'success' => false,
                'error_code' => 'ROUTE_NOT_FOUND',
                'message' => 'The requested endpoint does not exist.',
                'hint' => 'Check the API documentation for available endpoints.',
            ], 404);
        });

        // ═══════════ METHOD NOT ALLOWED ═══════════
        $this->renderable(function (MethodNotAllowedHttpException $e) {
            return response()->json([
                'success' => false,
                'error_code' => 'METHOD_NOT_ALLOWED',
                'message' => 'This HTTP method is not supported for this endpoint.',
            ], 405);
        });

        // ═══════════ AUTH ═══════════
        $this->renderable(function (AuthenticationException $e) {
            return response()->json([
                'success' => false,
                'error_code' => 'UNAUTHENTICATED',
                'message' => 'Authentication required.',
            ], 401);
        });

        // ═══════════ CATCH ALL ═══════════
        $this->renderable(function (Throwable $e) {
            if (request()->expectsJson() || request()->is('api/*')) {
                $statusCode = method_exists($e, 'getStatusCode') ? $e->getStatusCode() : 500;
                return response()->json([
                    'success' => false,
                    'error_code' => 'INTERNAL_ERROR',
                    'message' => app()->environment('production')
                        ? 'An unexpected error occurred. Please try again.'
                        : $e->getMessage(),
                    'hint' => app()->environment('production')
                        ? 'If this persists, contact support.'
                        : 'File: ' . basename($e->getFile()) . ':' . $e->getLine(),
                ], $statusCode);
            }
        });
    }
}

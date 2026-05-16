<?php

namespace App\Exceptions;

use Exception;

class BlockchainException extends Exception
{
    public string $errorCode;
    public ?string $hint;
    public int $statusCode;

    public function __construct(string $message, string $errorCode = 'BLOCKCHAIN_ERROR', ?string $hint = null, int $statusCode = 400)
    {
        parent::__construct($message);
        $this->errorCode = $errorCode;
        $this->hint = $hint;
        $this->statusCode = $statusCode;
    }

    public function render()
    {
        return response()->json([
            'success' => false,
            'error_code' => $this->errorCode,
            'message' => $this->getMessage(),
            'hint' => $this->hint,
        ], $this->statusCode);
    }
}

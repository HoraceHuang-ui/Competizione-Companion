// SPDX-License-Identifier: MIT
// Derived from acc-connector <https://github.com/lonemeow/acc-connector>
// Copyright (c) 2024 Ilpo Ruotsalainen
// Modifications Copyright (c) 2026 HoraceHYY

#pragma once

#define WIN32_LEAN_AND_MEAN
#include <Windows.h>

BOOL attachHooks();
void removeHooks();

void log_msg(const wchar_t* fmt, ...);

BOOL initProxy();
void closeProxy();

void initLog();
void closeLog();
void notify_status(void);

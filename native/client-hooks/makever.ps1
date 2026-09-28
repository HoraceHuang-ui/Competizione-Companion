# SPDX-License-Identifier: MIT
# Derived from acc-connector <https://github.com/lonemeow/acc-connector>
# Copyright (c) 2024 Ilpo Ruotsalainen
# Modifications Copyright (c) 2026 HoraceHYY
param($ver, $file)

$major, $minor, $patch = $ver -split "\."

# The provenance header is part of the generated output on purpose: version.h is
# rewritten on every release, so a header added by hand would be lost.
@"
// SPDX-License-Identifier: MIT
// Derived from acc-connector <https://github.com/lonemeow/acc-connector>
// Copyright (c) 2024 Ilpo Ruotsalainen
// Modifications Copyright (c) 2026 HoraceHYY

#define VERSION_BIN $major,$minor,$patch,0
#define VERSION_STR "$major.$minor.$patch.0"
"@ | Out-File -Encoding ASCII $file

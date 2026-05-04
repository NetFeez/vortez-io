#!/bin/bash

set -eo pipefail
output_file='build.log'

if (npx tsc 2>&1 | tee "$output_file"); then
    echo -e "\x1b[32mBuild succeeded.\x1b[0m"
    rm -f "$output_file"
else
    echo -e "\x1b[31mBuild failed. See \x1b[36m$output_file\x1b[0m for details.\x1b[0m"
    tail -n 20 "$output_file"
    echo -e "use 'cat $output_file' to see the full log."
    exit 1
fi
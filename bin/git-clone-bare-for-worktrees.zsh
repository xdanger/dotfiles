#!/bin/zsh
set -e
set -o pipefail

# git-clone-bare-for-worktrees
# ============================
# A smart Git repository cloner optimized for worktree-based development workflows.
#
# SYNOPSIS
# --------
# git-clone-bare-for-worktrees.zsh [-v|--verbose] [-V|--version] <repository-url> [branch-01] [branch-02 ...]
#
# DESCRIPTION
# -----------
# This script clones a Git repository as a bare repository and sets it up for efficient
# worktree-based development. Instead of having multiple full clones, you get one bare
# repository with lightweight worktrees for different branches.
#
# INSTALLATION
# ------------
# Add to your `.gitconfig` as an alias:
#
# Using git config command (recommended):
# ```bash
# git config --global alias.clone-bare-for-worktrees '!zsh $DOTFILES/bin/git-clone-bare-for-worktrees.zsh'
# ```
#
# Or manually add to `.gitconfig`:
# ```ini
# [alias]
#     clone-bare-for-worktrees = "!zsh $DOTFILES/bin/git-clone-bare-for-worktrees.zsh"
# ```
#
# EXAMPLES
# --------
# - Clone with default branch only:
#   git-clone-bare-for-worktrees git@github.com:scope/hello-world.git
#   → Creates: gh.scope.hello-world/
#
# - Clone with additional branches:
#   git-clone-bare-for-worktrees https://gitlab.com/scope/HelloWorld feature-x develop
#   → Creates: gl.scope.helloworld/ with main/, feature-x/, and develop/ worktrees
#
# NAMING CONVENTIONS
# ------------------
# Repository URLs are converted to local directory names following these rules:
# 1. Domain abbreviations:
#    - github.com → gh
#    - gitlab.com → gl
#    - huggingface.ai → hg
#    - bitbucket.org → bb
#    - *.taptap.com → tt
#    - Others → first 2 letters of domain
# 2. Scope and repo names are converted to lowercase
# 3. The `.git` suffix is ignored
# 4. Format: {domain}.{scope}.{repo}
#
# DIRECTORY STRUCTURE
# -------------------
# gh.scope.hello-world/
# ├── .bare/          # Bare repository (all Git objects)
# ├── .git            # File containing "gitdir: ./.bare"
# └── main/           # Worktree for default branch
# └── [branch-name]/  # Additional worktrees (if specified)
#
# KEY CONFIGURATIONS
# ------------------
# The script applies three critical configurations:
#
# 1. Creates `.git` file with "gitdir: ./.bare"
#    → Makes the root directory Git-aware for tools and scripts
#
# 2. Sets `worktree.useRelativePaths = true`
#    → Ensures worktrees work correctly in containers (e.g., devcontainers)
#    → Worktrees remain functional even if the absolute path changes
#
# 3. Sets `remote.origin.fetch = +refs/heads/*:refs/remotes/origin/*`
#    → Enables fetching all remote branches (not just the current one)
#    → Makes `git fetch`, `git pull`, and `git push` work as expected
#
# OUTPUT FORMAT
# -------------
# - Verbose messages: "🔍 {message}" to stdout (with -v flag)
# - Warning messages: "⚠️  {message}" to stderr in orange color
# - Warnings are shown when:
#   - Default branch is not 'main' or 'master'
#   - Requested branch doesn't exist in remote
#
# OPTIONS
# -------
# -v, --verbose    Enable detailed output
# -V, --version    Display version information
# -h, --help       Display help message

# Script version
VERSION="0.1.0"

# Color codes
ORANGE='\033[0;33m'
NC='\033[0m' # No Color

# Helper function for warnings
warn() {
    echo -e "${ORANGE}⚠️  $1${NC}" >&2
}

# Helper function for verbose output
verbose() {
    if [[ "$VERBOSE" == "true" ]]; then
        echo "🔍 $1"
    fi
}

# Parse command line options
VERBOSE=false
BRANCHES=()
while [[ $# -gt 0 ]]; do
    case "$1" in
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -V|--version)
            echo "clone-bare-for-worktrees version $VERSION"
            exit 0
            ;;
        -h|--help)
            echo "Usage: clone-bare-for-worktrees [-v|--verbose] [-V|--version] <repository-url> [branch-01] [branch-02 ...]"
            echo ""
            echo "Options:"
            echo "  -v, --verbose    Enable verbose output"
            echo "  -V, --version    Display version information"
            echo "  -h, --help       Display this help message"
            echo ""
            echo "Examples:"
            echo "  clone-bare-for-worktrees git@github.com:scope/hello-world.git"
            echo "  clone-bare-for-worktrees https://gitlab.com/scope/HelloWorld feature-branch develop"
            exit 0
            ;;
        -*)
            echo "Error: Unknown option: $1"
            echo "Try 'clone-bare-for-worktrees --help' for more information."
            exit 1
            ;;
        *)
            if [[ -z "$REPO_URL" ]]; then
                REPO_URL="$1"
            else
                BRANCHES+=("$1")
            fi
            shift
            ;;
    esac
done

# Check if repository URL is provided
if [[ -z "$REPO_URL" ]]; then
    echo "Error: Repository URL is required"
    echo "Usage: clone-bare-for-worktrees [-v|--verbose] [-V|--version] <repository-url> [branch-01] [branch-02 ...]"
    exit 1
fi

# Parse the repository URL to extract domain, scope, and repo name
verbose "Parsing URL: $REPO_URL"
if [[ "$REPO_URL" =~ ^git@([^:]+):([^/]+)/([^.]+)(\.git)?$ ]]; then
    # SSH format: git@github.com:scope/repo.git
    DOMAIN="${match[1]}"
    SCOPE="${match[2]}"
    REPO_NAME="${match[3]}"
elif [[ "$REPO_URL" =~ ^https?://([^/]+)/([^/]+)/([^/]+)(\.git)?$ ]]; then
    # HTTPS format: https://github.com/scope/repo
    DOMAIN="${match[1]}"
    SCOPE="${match[2]}"
    REPO_NAME="${match[3]}"
else
    echo "Error: Invalid repository URL format"
    echo "Expected formats:"
    echo "  - git@github.com:scope/repo.git"
    echo "  - https://github.com/scope/repo"
    exit 1
fi

# Extract domain abbreviation based on domain
# Common abbreviations derived from domain patterns
get_domain_abbr() {
    local domain="$1"
    local name="${domain%%.*}"  # Get first part before first dot

    # Special cases for well-known providers
    case "$domain" in
        github.com) echo "gh" ;;
        gitlab.com) echo "gl" ;;
        bitbucket.org) echo "bb" ;;
        huggingface.ai) echo "hg" ;;
        *taptap.com) echo "tt" ;;
        *)
            # For other domains, use intelligent abbreviation
            if [[ "$name" =~ ^git ]]; then
                # If starts with 'git', use the next part
                local remaining="${domain#git.}"
                echo "${remaining:0:2}"
            else
                # Use first two letters of domain name
                echo "${name:0:2}"
            fi
            ;;
    esac
}

DOMAIN_ABBR=$(get_domain_abbr "$DOMAIN")
verbose "Domain: $DOMAIN -> Abbreviation: $DOMAIN_ABBR"

# Convert scope and repo name to lowercase
SCOPE_LOWER="${(L)SCOPE}"
REPO_NAME_LOWER="${(L)REPO_NAME}"
verbose "Scope: $SCOPE -> $SCOPE_LOWER (lowercase)"
verbose "Repository name: $REPO_NAME -> $REPO_NAME_LOWER (lowercase)"

# Create directory name: domain.scope.repo
DIR_NAME="${DOMAIN_ABBR}.${SCOPE_LOWER}.${REPO_NAME_LOWER}"
verbose "Directory name: $DIR_NAME"

# Check if directory already exists
if [[ -d "$DIR_NAME" ]]; then
    echo "Error: Directory '$DIR_NAME' already exists"
    exit 1
fi

# Create the directory
echo "Creating directory: $DIR_NAME"
mkdir -p "$DIR_NAME"
cd "$DIR_NAME"

# Clone the repository as bare
echo "Cloning repository as bare..."
if [[ "$VERBOSE" == "true" ]]; then
    git clone --bare "$REPO_URL" .bare
else
    git clone --bare "$REPO_URL" .bare 2>&1 | grep -v "Cloning into"
fi

# Create .git file pointing to .bare
echo "gitdir: ./.bare" > .git

# Configure the repository for worktree usage
verbose "Configuring repository for worktree usage..."
# Enable relative paths for worktrees (important for devcontainer compatibility)
git config --local worktree.useRelativePaths true
# Configure fetch to get all remote branches
git config remote.origin.fetch "+refs/heads/*:refs/remotes/origin/*"

# Get the default branch name
cd .bare
DEFAULT_BRANCH=$(git symbolic-ref --short HEAD)
cd ..
verbose "Default branch: $DEFAULT_BRANCH"

# Check if default branch is main or master
if [[ "$DEFAULT_BRANCH" != "main" && "$DEFAULT_BRANCH" != "master" ]]; then
    warn "Default branch '$DEFAULT_BRANCH' is not 'main' or 'master'"
fi

# Add main worktree for the default branch
echo "Adding worktree for branch '$DEFAULT_BRANCH'..."
git worktree add main "$DEFAULT_BRANCH"

# Process additional branches
if [[ ${#BRANCHES[@]} -gt 0 ]]; then
    verbose "Processing additional branches: ${BRANCHES[@]}"

    # Get list of remote branches (trim "origin/" prefix, remove HEAD line)
    REMOTE_BRANCHES=$(git branch -r \
        | sed -e 's#^[[:space:]]*origin/##' -e '/^HEAD ->/d' \
    )

    for branch in "${BRANCHES[@]}"; do
        # Check if branch exists in remote
        if echo "$REMOTE_BRANCHES" | grep -qxF -- "$branch"; then
            echo "Adding worktree for branch '$branch'..."
            git worktree add "$branch" "$branch"
        else
            warn "Branch '$branch' does not exist in remote repository"
        fi
    done
fi

echo ""
echo "✅ Repository cloned successfully!"
echo ""
echo "Directory structure:"
echo "  $DIR_NAME/"
echo "  ├── .bare/     (bare repository)"
echo "  ├── .git       (gitdir reference)"
echo "  └── main/      (worktree for $DEFAULT_BRANCH)"

# List additional worktrees if any
for branch in "${BRANCHES[@]}"; do
    if [[ -d "$branch" ]]; then
        echo "  └── $branch/   (worktree for $branch)"
    fi
done

echo ""
echo "To create additional worktrees:"
echo "  cd $DIR_NAME"
echo "  git worktree add <directory> <branch>"
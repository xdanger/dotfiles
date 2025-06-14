#!/bin/zsh
set -e
set -o pipefail
#
# This script clones a bare repository for use with git worktrees.
# Usage:
#   - git-clone-bare-for-worktrees.zsh [-v|--verbose] [-V|--version] <repository-url> [branch-01] [branch-02 ...]
#   - or put it in `.gitconfig` file as an alias:
#     ```ini
#     [alias]
#         clone-bare-for-worktrees = "!zsh $DOTFILES/bin/git-clone-bare-for-worktrees.zsh"
#     ```
# For example:
#   - `git-clone-bare-for-worktrees.zsh git@github.com:scope/hello-world.git` will clone the repository into `gh.scope.hello-world`
#   - `git-clone-bare-for-worktrees.zsh https://gitlab.com/scope/HelloWorld` will clone the repository into `gl.scope.helloworld`
# Rules:
#   - make the scope and repo name lowercase
#   - use domain abbreviations: github.com→gh, gitlab.com→gl, huggingface.ai→hg, bitbucket.org→bb, git.gametaptap.com→tt
#   - for unknown domains, use the first two letters as abbreviation
#   - ignore the `.git` suffix in the URL
# The directory structure of `gh.scope.hello-world` will be:
#   - `.bare/`: the bare repository
#   - `.git`: a plain text file with has the content of "gitdir: ./.bare"
#   - `main/`: a directory for worktrees, upstreamed to the `origin/main` or `origin/master` branch
#     - leave a warning if the default branch is not `main` or `master`
#   - other branches that passed as arguments will be created as additional worktrees
#     - leave a warning if the given branch does not exist in the remote repository
# Warning message should be:
#   - in orange color
#   - in stderr pipe
#   - with a prefix "⚠️ "
# Verbose message should be:
#   - in stdout pipe
#   - with a prefix "🔍 "

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
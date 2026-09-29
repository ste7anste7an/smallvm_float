#!/bin/bash
# Build the GP IDE for all platforms.

# parse parameters
while echo $1 | grep ^- > /dev/null; do eval $( echo $1 | sed 's/-//g' | sed 's/=.*//g' | tr -d '\012')=$( echo $1 | sed 's/.*=//g' | tr -d '\012'); shift; done

if test -n "$help"; then
	echo "The microBlocks desktop IDE builder and packager generates executables for"
	echo "Windows, MacOS and GNU/Linux (including RaspberryPi)."
	echo "It can also generate installers for Windows and MacOS, and .deb packages for"
	echo "GNU/Linux."
	echo
	echo "usage: ./build.sh [OPTIONS]"
	echo
	echo "--help                        Print this message."
	echo "--pack                        Create packages and installers. If --system parameter"
	echo "                              is present, it will only create it for the specified"
	echo "                              platform."
	echo "  --system=[SYSTEM]           Specify which system to pack for. Valid values are"
	echo "                              linux, macos and windows."
	echo "--version=[VERSION-NUMBER]    Specify a version number, i.e. 0.1.16rc3. If not set,"
	echo "                              it will try to parse it from the GP source files."
	echo "--vm                          Build VMs for all officially supported boards. These"
	echo "                              will be embedded into the IDE."
	echo "--tools                       Automatically try to install missing tools needed"
	echo "                              by the build process."
	echo "--locale=[LANGUAGE-CODE]      Update locales for the specified language. To print"
	echo "                              all currently available languages, run it without"
	echo "                              an argument. If language does not exist, a new"
	echo "                              locale file will be created for it. If it does, a"
	echo "                              backup copy of the current locale file will be"
	echo "                              created in your OS temporary files directory."
	echo "                              Run with \"=all\" to update all existing locales."
	echo "--gp                          Rebuild the GP part of MicroBlocks."
	echo "--boardie                     Build Boardie."
	echo "--electron                    Run the an Electron app. Can be combined with --gp"
	echo "                              to make sure you're running the latest version of"
	echo "                              the GP part of the IDE."
	echo
	exit 0
fi

currentOS=`uname -s`
if [ "$currentOS" == "Darwin" ]; then
	gpExecutable="gp-mac"
elif [ "$currentOS" == "Linux" ]; then
	gpExecutable="gp-linux64bit"
else
	echo "Platform $currentOS is not (yet?) supported by this build script."
	echo "Try to find the gp executable for your platform in this folder and run:"
	echo "cd gp; [command-to-run-GP] runtime/lib/* loadIDE.gp buildApps.gp"
	echo "Good luck!"
	exit 1
fi

if test -n "$locale"; then
	if [ $locale == '--locale' ]; then
		echo "Currently available locales:"
		echo
		for lang in translations/*.po; do
			echo $lang | cut -c14- | cut -f1 -d.
		done
		echo
	elif [ $locale == 'all' ]; then
		echo "Updating all available locales:"
		echo
		for lang in translations/*.po; do
			./build.sh --locale=`echo $lang | cut -c14- | cut -f1 -d.`
		done
		echo
	else
		echo "Updating locale file for $locale..."
		(cd gp; ./$gpExecutable runtime/lib/* loadIDE.gp updateLocale.gp -- $locale)
		echo "Done."
		echo "Please edit the updated locale file at translations/$locale.po"
		missing=`grep "^msgstr \"\"" translations/$locale.po | wc -l`
		echo "A total of $missing missing strings have been found."
	fi
	exit 0
fi

if test -n "$vm"; then
	(cd precompiled; ./updatePrecompiled.sh)
fi

if [ -z $version ]; then
	version=`head -n1 gp/runtime/versions | sed -E "s/^IDE //"`
fi

if test -n "$tools"; then
	# try to install all tooling needed to build and pack the apps
	echo "Installing Electron and dependencies"
	(cd electron; npm install)
	echo "Installing Electron ASAR"
	(cd electron; npm install --engine-strict @electron/asar)
	if [ "$currentOS" == "Linux" ]; then
		echo "Note that you'll additionally need to install the following packages manually:"
		if [ -z `command -v eu-strip` ]; then echo "elfutils"; fi
		if [ -z `command -v wine` ]; then echo "wine"; fi
		if [ -z `command -v mono` ]; then echo "mono"; fi
		(cd electron/packagers/windows; ./install-inno.sh)
		echo "If you get a Mono/Wine error when packaging for Windows, remove the ~/.wine folder and run winecfg"
	fi
	exit 0
fi

if test -n "$boardie"; then
	(cd boardie; ./buildBoardie.sh)
fi

if test -n "$gp"; then
	echo "Building GP webapp..."
	(cd chromeApp/emscripten; ./buildEmcc.sh)
	if [ -z $electron ]; then
		# quit the script unless we're also being asked to build the electron wrapper
		exit 0
	fi
fi

if [ -z $system ]; then
	system="all"
fi

if test -n "$electron"; then
	if test -n "$pack"; then
		(cd electron; ./pack.sh $system $version)
	else
		(cd electron; npm run start)
	fi
	exit 0
fi


echo
echo "Done building $version"

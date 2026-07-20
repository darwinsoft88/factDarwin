# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# Expo modules rely on Kotlin descriptors through reflection during startup.
# R8 can strip these classes in local release builds if they are not kept.
-keep class expo.modules.kotlin.** { *; }
-keep class expo.modules.adapters.react.** { *; }

# Expo document picker optional generated descriptors.
-dontwarn expo.modules.kotlin.types.AnyTypeCache
-dontwarn expo.modules.kotlin.types.OptimizedRecord
-dontwarn expo.modules.kotlin.types.descriptors.RawTypeDescriptor
-dontwarn expo.modules.kotlin.types.descriptors.TypeDescriptor
-dontwarn expo.modules.kotlin.types.descriptors.TypeDescriptorKt
-dontwarn expo.modules.kotlin.types.descriptors.TypeDescriptorOfKt

# Add any project specific keep options here:
